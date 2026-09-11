import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkList from "./WorkList";

jest.mock("firebase/firestore", () => ({
  doc: (...args) => ({ __doc: args }),
  deleteDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  collection: (...args) => ({ __collection: args }),
  query: (...args) => ({ __query: args }),
  where: (...args) => ({ __where: args }),
  onSnapshot: jest.fn((q, cb) => { cb({ docs: [] }); return () => {}; }),
}));
jest.mock("firebase/storage", () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock("../firebase", () => ({ db: {}, storage: {} }));

const { updateDoc } = require("firebase/firestore");

const profile = { name: "이수정", companyName: "배관119" };

function makeWork(overrides) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-15`;
  return {
    id: Math.random().toString(),
    date: dateStr, clientCompany: "고객사", location: "서울",
    amount: 100000, feeRate: 0, feeAmount: 0, netAmount: 100000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
    ...overrides,
  };
}

beforeEach(() => { jest.clearAllMocks(); });

test("'외상' 금액을 클릭하면 외상 건만 필터링되어 보인다", async () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  expect(screen.getByText("현금고객")).toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();

  await user.click(screen.getByTestId("pay-filter-credit"));

  expect(screen.queryByText("현금고객")).not.toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});

test("이미 선택된 결제수단을 다시 누르면 필터가 해제되어 전체가 다시 보인다", async () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  await user.click(screen.getByTestId("pay-filter-credit"));
  expect(screen.queryByText("현금고객")).not.toBeInTheDocument();

  await user.click(screen.getByTestId("pay-filter-credit"));
  expect(screen.getByText("현금고객")).toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});

test("'필터 해제' 버튼을 누르면 전체 목록으로 돌아간다", async () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  await user.click(screen.getByTestId("pay-filter-credit"));
  await user.click(screen.getByText("✕ 필터 해제 (전체 보기)"));

  expect(screen.getByText("현금고객")).toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});

test("외상 건에만 '입금확인' 버튼이 보이고, 현금/카드 건에는 보이지 않는다", () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  render(<WorkList works={works} profile={profile} />);

  const buttons = screen.getAllByText("✅ 입금확인");
  expect(buttons.length).toBe(1); // 외상 건 1개에만 존재
});

test("입금확인 버튼을 누르고 확인하면, 결제방식이 credit에서 cash로 변경 저장된다", async () => {
  window.confirm = jest.fn(() => true);
  const works = [makeWork({ id: "w1", clientCompany: "외상고객", payment: "credit", netAmount: 150000 })];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  await user.click(screen.getByText("✅ 입금확인"));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("외상고객"));
  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.payment).toBe("cash");
});

test("확인 창에서 취소하면 입금확인 처리가 되지 않는다", async () => {
  window.confirm = jest.fn(() => false);
  const works = [makeWork({ payment: "credit" })];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  await user.click(screen.getByText("✅ 입금확인"));

  expect(updateDoc).not.toHaveBeenCalled();
});

test("입금확인 버튼 클릭은 목록 항목 클릭(상세보기 모달 열림)으로 전파되지 않는다", async () => {
  window.confirm = jest.fn(() => true);
  const works = [makeWork({ payment: "credit" })];
  const user = userEvent.setup();
  render(<WorkList works={works} profile={profile} />);

  await user.click(screen.getByText("✅ 입금확인"));

  // 상세보기 모달이 열렸다면 나타날 요소(예: 작업보고서 버튼 등)가 없어야 함 -- 여기서는 모달 텍스트 부재로 간접 확인
  expect(screen.queryByText("작업보고서")).not.toBeInTheDocument();
});
