import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DetailedEstimateForm from "./DetailedEstimateForm";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-id" })),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  onSnapshot: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { addDoc, updateDoc, onSnapshot } = require("firebase/firestore");

const profile = {
  uid: "uid-1", name: "이수정", companyName: "배관119", phone: "01099998888",
  businessNumber: "123-45-67890", companyAddress: "서울시 강남구", signatureUrl: "",
};

const WORKER_DIRECTORY = [
  { id: "uid-2", name: "김철수", companyName: "철수설비", phone: "01011112222", businessNumber: "", companyAddress: "", signatureUrl: "" },
];

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "workerDirectory") cb({ docs: WORKER_DIRECTORY.map(u => ({ id: u.id, data: () => u })) });
    else cb({ docs: [] }); // detailedEstimates 등 나머지는 빈 목록
    return () => {};
  });
});

test("새 세부견적서 작성 화면에 기본적으로 본인 이름/업체명이 채워진다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  expect(screen.getByDisplayValue("이수정")).toBeInTheDocument();
  expect(screen.getByDisplayValue("배관119")).toBeInTheDocument();
});

test("품목을 입력하면 공급가액이 자동 계산되고, 여러 품목의 합계도 정확히 집계된다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  await user.type(screen.getByPlaceholderText("품명 (예: PVC 배관)"), "PVC 배관");
  const qtyInputs = screen.getAllByPlaceholderText("수량");
  const priceInputs = screen.getAllByPlaceholderText("단가");
  await user.type(qtyInputs[0], "3");
  await user.type(priceInputs[0], "10000");

  expect(screen.getByText("공급가액: 30,000원")).toBeInTheDocument();
  // 총 합계금액 = 30000 + 세액(3000) = 33000
  expect(screen.getByText("33,000원")).toBeInTheDocument();
});

test("품목 추가 버튼으로 여러 줄을 추가할 수 있고, 최대 10개까지만 가능하다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  for (let i = 0; i < 9; i++) {
    await user.click(screen.getByText("➕ 품목 추가"));
  }
  // 10개가 되면 추가 버튼이 사라져야 함
  expect(screen.queryByText("➕ 품목 추가")).not.toBeInTheDocument();
  expect(screen.getByText("10/10")).toBeInTheDocument();
});

test("'다른 사용자 선택'을 눌러 목록에서 고르면 그 사람 정보로 공급자 정보가 채워진다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  await user.click(screen.getByText("👤 다른 사용자 선택"));
  await user.click(screen.getByText(/김철수/));

  expect(screen.getByDisplayValue("김철수")).toBeInTheDocument();
  expect(screen.getByDisplayValue("철수설비")).toBeInTheDocument();
});

test("결제방식 청구를 선택하고 필수 항목을 채운 뒤 저장하면 Firestore에 정확히 저장된다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.type(screen.getByPlaceholderText("품명 (예: PVC 배관)"), "배관 교체");
  await user.type(screen.getAllByPlaceholderText("수량")[0], "2");
  await user.type(screen.getAllByPlaceholderText("단가")[0], "50000");
  await user.click(screen.getByText("🧾 청구"));

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.issuedTo).toBe("홍길동님");
  expect(savedData.payment).toBe("invoice");
  expect(savedData.supplyTotal).toBe(100000);
  expect(savedData.taxTotal).toBe(10000);
  expect(savedData.amount).toBe(110000);
  expect(savedData.createdByName).toBe("이수정");
  expect(savedData.items[0].name).toBe("배관 교체");
});

test("품목이 하나도 없으면 저장이 차단된다", async () => {
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.click(screen.getByText("💾 견적서 저장"));

  expect(window.alert).toHaveBeenCalledWith("품목을 1개 이상 입력해주세요.");
  expect(addDoc).not.toHaveBeenCalled();
});

test("품목 단위 목록에 인건비 관련 단위(인, 공, 일, 시간)가 포함되어 있다", async () => {
  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 세부견적서 작성"));

  const unitSelect = screen.getAllByRole("combobox")[0];
  const optionValues = within(unitSelect).getAllByRole("option").map(o => o.value);
  expect(optionValues).toEqual(expect.arrayContaining(["인", "공", "일", "시간"]));
});

test("기존 세부견적서를 수정하면 updatedByName과 updatedAt이 함께 저장된다", async () => {
  const existing = {
    id: "est-1", date: "2026-06-01", validUntil: "2026-06-04",
    issuedTo: "김철수님", issuedToPhone: "", location: "서울",
    items: [{ name: "기존품목", spec: "", qty: "1", unit: "식", unitPrice: "100000" }],
    payment: "cash", paymentCustom: "", memo: "",
    workerName: "박원작성", workerCompany: "원작성팀", workerPhone: "01011112222",
    workerBusinessNumber: "", workerAddress: "", signatureUrl: "",
    createdAt: "2026-06-01T00:00:00.000Z", createdByName: "박원작성",
  };
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "workerDirectory") cb({ docs: WORKER_DIRECTORY.map(u => ({ id: u.id, data: () => u })) });
    else if (collName === "detailedEstimates") cb({ docs: [{ id: "est-1", data: () => existing }] });
    else cb({ docs: [] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<DetailedEstimateForm profile={profile} />);
  await user.click(screen.getByText("김철수님"));
  await user.click(screen.getByText("✏️ 수정"));
  await user.click(screen.getByText("✏️ 수정 저장"));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.updatedByName).toBe("이수정"); // 현재 로그인 계정 이름
  expect(savedData.updatedAt).toBeDefined();
});
