import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EstimateForm from "./EstimateForm";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-id" })),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  onSnapshot: jest.fn((q, cb) => { cb({ docs: [] }); return () => {}; }),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { addDoc, updateDoc, onSnapshot } = require("firebase/firestore");

const profile = {
  name: "이수정",
  companyName: "배관119",
  phone: "01099998888",
  signatureUrl: "",
};

const getAmountInputs = () => {
  const inputs = screen.getAllByPlaceholderText("0");
  return { supplyInput: inputs[0], amountInput: inputs[1] };
};

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((q, cb) => { cb({ docs: [] }); return () => {}; });
});

async function fillRequiredFields(user) {
  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "홍길동님");
  await user.type(screen.getByPlaceholderText("시공 장소 주소"), "서울시 강남구");
}

test("단가/합계금액 입력란에 숫자 키패드(inputMode=numeric)가 적용되어 있다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));

  const { supplyInput, amountInput } = getAmountInputs();
  expect(supplyInput).toHaveAttribute("inputmode", "numeric");
  expect(amountInput).toHaveAttribute("inputmode", "numeric");
});

test("합계금액 입력 시 단가/세액이 자동 계산되어 화면에 표시된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { amountInput } = getAmountInputs();
  await user.type(amountInput, "110000");

  expect(screen.getByText("100,000원")).toBeInTheDocument();
  expect(screen.getByText("10,000원")).toBeInTheDocument();
});

test("단가 입력 시 세액/합계금액이 자동 계산되어 화면에 표시된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { supplyInput } = getAmountInputs();
  await user.type(supplyInput, "100000");

  expect(screen.getByText("10,000원")).toBeInTheDocument();
  expect(screen.getByText("110,000원")).toBeInTheDocument();
});

test("단가로 계산된 합계금액을 사용자가 다시 직접 수정하면, 합계금액 기준으로 단가/세액이 재계산된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { supplyInput, amountInput } = getAmountInputs();
  await user.type(supplyInput, "100000");
  expect(amountInput).toHaveValue(110000);

  await user.clear(amountInput);
  await user.type(amountInput, "99000");

  expect(screen.getByText("90,000원")).toBeInTheDocument();
  expect(screen.getByText("9,000원")).toBeInTheDocument();
});

test("합계금액으로 계산된 단가를 사용자가 다시 직접 수정하면, 단가 기준으로 세액/합계금액이 재계산된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { supplyInput, amountInput } = getAmountInputs();
  await user.type(amountInput, "110000");
  expect(supplyInput).toHaveValue(100000);

  await user.clear(supplyInput);
  await user.type(supplyInput, "200000");

  expect(screen.getByText("20,000원")).toBeInTheDocument();
  expect(screen.getByText("220,000원")).toBeInTheDocument();
});

test("결제방식: 현금/카드/청구/기타 선택이 가능하고 기타 선택 시 입력란이 나타난다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));

  expect(screen.getByText("💵 현금")).toBeInTheDocument();
  expect(screen.getByText("💳 카드")).toBeInTheDocument();
  expect(screen.getByText("🧾 청구")).toBeInTheDocument();
  expect(screen.getByText("✏️ 기타")).toBeInTheDocument();

  await user.click(screen.getByText("✏️ 기타"));
  expect(screen.getByPlaceholderText("결제방식을 입력하세요 (필수)")).toBeInTheDocument();
});

test("결제방식 '청구'를 선택하고 저장하면 정상적으로 저장된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { amountInput } = getAmountInputs();
  await user.type(amountInput, "110000");
  await user.click(screen.getByText("🧾 청구"));

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.payment).toBe("invoice");
});

test("결제방식 기타를 선택하고 내용을 비워둔 채 저장하면 경고가 뜨고 저장되지 않는다", async () => {
  window.alert = jest.fn();
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { amountInput } = getAmountInputs();
  await user.type(amountInput, "110000");
  await user.click(screen.getByText("✏️ 기타"));

  await user.click(screen.getByText("💾 견적서 저장"));

  expect(window.alert).toHaveBeenCalledWith("결제방식(기타)을 입력해주세요.");
  expect(addDoc).not.toHaveBeenCalled();
});

test("합계금액 기준으로 입력 후 저장하면 Firestore에 합계금액/단가/세액이 모두 정확히 저장된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { amountInput } = getAmountInputs();
  await user.type(amountInput, "110000");
  await user.click(screen.getByText("💳 카드"));

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.amount).toBe(110000);
  expect(savedData.supplyAmount).toBe(100000);
  expect(savedData.taxAmount).toBe(10000);
  expect(savedData.payment).toBe("card");
  expect(savedData.supplyAmount + savedData.taxAmount).toBe(savedData.amount);

  expect(await screen.findByText("✅ 저장되었습니다!")).toBeInTheDocument();
});

test("단가 기준으로 입력 후 저장하면 Firestore에 사용자가 입력한 단가 그대로, 세액/합계금액도 정확히 저장된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { supplyInput } = getAmountInputs();
  await user.type(supplyInput, "300000");
  await user.click(screen.getByText("💵 현금"));

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.supplyAmount).toBe(300000);
  expect(savedData.taxAmount).toBe(30000);
  expect(savedData.amount).toBe(330000);
});

test("기타 결제방식 내용까지 입력하면 정상 저장된다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));
  await fillRequiredFields(user);

  const { amountInput } = getAmountInputs();
  await user.type(amountInput, "55000");
  await user.click(screen.getByText("✏️ 기타"));
  await user.type(screen.getByPlaceholderText("결제방식을 입력하세요 (필수)"), "계좌이체");

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.payment).toBe("other");
  expect(savedData.paymentCustom).toBe("계좌이체");
  expect(savedData.supplyAmount).toBe(50000);
  expect(savedData.taxAmount).toBe(5000);
});

test("견적서 수정 화면을 열면 기본적으로 기존 작성자 정보가 그대로 유지된다(토글 기본값=기존 작성자 유지)", async () => {
  const originalEstimate = {
    date: "2026-06-20",
    validUntil: "2026-06-23",
    issuedTo: "김철수님",
    location: "서울시 마포구",
    content: "누수 수리",
    amount: 220000,
    payment: "cash",
    paymentCustom: "",
    workerName: "박원작성",
    workerCompany: "원작성팀",
    workerPhone: "01011112222",
    signatureUrl: "original-sign.png",
  };
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: [{ id: "est-1", data: () => originalEstimate }] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);

  await user.click(screen.getByText("김철수님"));
  expect(screen.getByText(/박원작성/)).toBeInTheDocument();

  await user.click(screen.getByText("✏️ 수정"));
  expect(screen.getByText("기존 작성자 유지")).toBeInTheDocument();
  expect(screen.getByText(/박원작성/)).toBeInTheDocument();
  expect(screen.queryByText(/이수정/)).not.toBeInTheDocument();

  await user.click(screen.getByText("✏️ 수정 저장"));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.workerName).toBe("박원작성");
  expect(savedData.workerPhone).toBe("01011112222");
  expect(savedData.writerMode).toBeUndefined();
  expect(savedData.originalWorker).toBeUndefined();
});

test("토글을 켜면 현재 로그인 계정으로 작성자 정보가 바뀌고, 합계금액 변경과 함께 그 상태로 저장된다", async () => {
  const originalEstimate = {
    date: "2026-06-20",
    validUntil: "2026-06-23",
    issuedTo: "김철수님",
    location: "서울시 마포구",
    content: "누수 수리",
    amount: 220000,
    payment: "cash",
    paymentCustom: "",
    workerName: "박원작성",
    workerCompany: "원작성팀",
    workerPhone: "01011112222",
    signatureUrl: "original-sign.png",
  };
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: [{ id: "est-1", data: () => originalEstimate }] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("김철수님"));
  await user.click(screen.getByText("✏️ 수정"));

  const toggle = screen.getByRole("switch");
  expect(toggle).toHaveAttribute("aria-checked", "false");
  await user.click(toggle);

  expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("현재 로그인 계정으로 변경")).toBeInTheDocument();
  expect(screen.getByText(/이수정/)).toBeInTheDocument();
  expect(screen.queryByText(/박원작성/)).not.toBeInTheDocument();

  const { amountInput } = getAmountInputs();
  await user.clear(amountInput);
  await user.type(amountInput, "110000");
  expect(screen.getByText("100,000원")).toBeInTheDocument();
  expect(screen.getByText("10,000원")).toBeInTheDocument();

  await user.click(screen.getByText("✏️ 수정 저장"));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.workerName).toBe("이수정");
  expect(savedData.workerPhone).toBe("01099998888");
  expect(savedData.amount).toBe(110000);
  expect(savedData.supplyAmount).toBe(100000);
  expect(savedData.taxAmount).toBe(10000);
});

test("토글을 켰다가 다시 끄면 원래 작성자 정보로 복귀한다", async () => {
  const originalEstimate = {
    date: "2026-06-20", validUntil: "2026-06-23",
    issuedTo: "김철수님", location: "서울시 마포구", content: "누수 수리",
    amount: 220000, payment: "cash", paymentCustom: "",
    workerName: "박원작성", workerCompany: "원작성팀",
    workerPhone: "01011112222", signatureUrl: "original-sign.png",
  };
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: [{ id: "est-1", data: () => originalEstimate }] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("김철수님"));
  await user.click(screen.getByText("✏️ 수정"));

  const toggle = screen.getByRole("switch");
  await user.click(toggle);
  expect(screen.getByText(/이수정/)).toBeInTheDocument();

  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText(/박원작성/)).toBeInTheDocument();
  expect(screen.queryByText(/이수정/)).not.toBeInTheDocument();
});

test("원작성자와 현재 로그인 계정이 같은 사람이면 토글이 표시되지 않는다", async () => {
  const myOwnEstimate = {
    date: "2026-06-20", validUntil: "2026-06-23",
    issuedTo: "김철수님", location: "서울시 마포구", content: "누수 수리",
    amount: 220000, payment: "cash", paymentCustom: "",
    workerName: "이수정", workerCompany: "배관119",
    workerPhone: "01099998888", signatureUrl: "",
  };
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: [{ id: "est-1", data: () => myOwnEstimate }] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("김철수님"));
  await user.click(screen.getByText("✏️ 수정"));

  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.getByText(/이수정/)).toBeInTheDocument();
});

test("새 견적서 작성 화면에는 작성자 토글이 표시되지 않는다", async () => {
  const user = userEvent.setup();
  render(<EstimateForm profile={profile} isAdmin={true} />);
  await user.click(screen.getByText("📋 새 견적서 작성"));

  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});
