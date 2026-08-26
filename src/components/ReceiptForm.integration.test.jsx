import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceiptForm from "./ReceiptForm";

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
    else cb({ docs: [] });
    return () => {};
  });
});

test("새 영수증 작성 화면에 기본적으로 본인 이름/업체명이 채워진다", async () => {
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  expect(screen.getByDisplayValue("이수정")).toBeInTheDocument();
  expect(screen.getByDisplayValue("배관119")).toBeInTheDocument();
});

test("금액을 입력하면 한글 금액 표기가 자동으로 함께 표시된다", async () => {
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.type(screen.getByPlaceholderText("0"), "110000");

  expect(screen.getByText(/금 십일만원整/)).toBeInTheDocument();
});

test("금액이 바뀌면 한글 표기도 함께 갱신된다", async () => {
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  const amountInput = screen.getByPlaceholderText("0");
  await user.type(amountInput, "110000");
  expect(screen.getByText(/금 십일만원整/)).toBeInTheDocument();

  await user.clear(amountInput);
  await user.type(amountInput, "55000");
  expect(screen.getByText(/금 오만오천원整/)).toBeInTheDocument();
});

test("'다른 사용자 선택'을 눌러 목록에서 고르면 그 사람 정보로 공급자 정보가 채워진다", async () => {
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.click(screen.getByText("👤 다른 사용자 선택"));
  await user.click(screen.getByText(/김철수/));

  expect(screen.getByDisplayValue("김철수")).toBeInTheDocument();
  expect(screen.getByDisplayValue("철수설비")).toBeInTheDocument();
});

test("필수 항목을 채우고 저장하면 Firestore에 정확히 저장되고, 한글 금액도 재계산 가능한 원본 금액이 저장된다", async () => {
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.type(screen.getByPlaceholderText("0"), "110000");
  await user.click(screen.getByText("🧾 청구"));

  await user.click(screen.getByText("💾 영수증 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.receivedFrom).toBe("홍길동님");
  expect(savedData.amount).toBe(110000);
  expect(savedData.payment).toBe("invoice");
  expect(savedData.createdByName).toBe("이수정");
});

test("받는분을 입력하지 않으면 저장이 차단된다", async () => {
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.type(screen.getByPlaceholderText("0"), "50000");
  await user.click(screen.getByText("💾 영수증 저장"));

  expect(window.alert).toHaveBeenCalledWith("받는분(지불하신 분)을 입력해주세요.");
  expect(addDoc).not.toHaveBeenCalled();
});

test("금액을 입력하지 않으면 저장이 차단된다", async () => {
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.click(screen.getByText("💾 영수증 저장"));

  expect(window.alert).toHaveBeenCalledWith("금액을 입력해주세요.");
  expect(addDoc).not.toHaveBeenCalled();
});

test("결제방식 기타를 선택하고 내용을 비워두면 저장이 차단된다", async () => {
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("🧾 새 영수증 작성"));

  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.type(screen.getByPlaceholderText("0"), "50000");
  await user.click(screen.getByText("✏️ 기타"));
  await user.click(screen.getByText("💾 영수증 저장"));

  expect(window.alert).toHaveBeenCalledWith("결제방식(기타)을 입력해주세요.");
  expect(addDoc).not.toHaveBeenCalled();
});

test("기존 영수증을 수정하면 updatedByName과 updatedAt이 함께 저장된다", async () => {
  const existing = {
    id: "rc-1", date: "2026-06-01", receivedFrom: "김철수님", content: "수리비",
    amount: 100000, payment: "cash", paymentCustom: "", memo: "",
    workerName: "박원작성", workerCompany: "원작성팀", workerPhone: "01011112222",
    workerBusinessNumber: "", workerAddress: "", signatureUrl: "",
    createdAt: "2026-06-01T00:00:00.000Z", createdByName: "박원작성",
  };
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "workerDirectory") cb({ docs: WORKER_DIRECTORY.map(u => ({ id: u.id, data: () => u })) });
    else if (collName === "receipts") cb({ docs: [{ id: "rc-1", data: () => existing }] });
    else cb({ docs: [] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<ReceiptForm profile={profile} />);
  await user.click(screen.getByText("김철수님"));
  await user.click(screen.getByText("✏️ 수정"));
  await user.click(screen.getByText("✏️ 수정 저장"));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.updatedByName).toBe("이수정");
  expect(savedData.updatedAt).toBeDefined();
});
