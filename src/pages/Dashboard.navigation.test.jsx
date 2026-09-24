import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "./Dashboard";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  query: (...args) => ({ __query: args }),
  where: (...args) => ({ __where: args }),
  onSnapshot: jest.fn((q, cb) => { cb({ docs: [] }); return () => {}; }),
  doc: (...args) => ({ __doc: args }),
  deleteDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock("firebase/storage", () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock("../firebase", () => ({ db: {}, storage: {} }));

const profile = { name: "이수정", companyName: "배관119" };

function makeWork(overrides) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-15`;
  return {
    id: Math.random().toString(),
    date: dateStr, clientCompany: "고객사", location: "서울",
    amount: 100000, feeRate: 30, feeAmount: 30000, netAmount: 70000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
    ...overrides,
  };
}

function getThisYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
}

test("순이익 카드를 클릭하면 매출일지로 이동하며 이번달 필터가 함께 전달된다", async () => {
  const onTabChange = jest.fn();
  const user = userEvent.setup();
  render(<Dashboard works={[makeWork({})]} expenses={[]} profile={profile} onTabChange={onTabChange} />);

  await user.click(screen.getByText("이번달 순이익"));

  expect(onTabChange).toHaveBeenCalledWith("revenue", { month: getThisYm(), payment: "" });
});

test("현금 항목을 클릭하면 매출일지로 이동하며 이번달+현금 필터가 함께 전달된다", async () => {
  const onTabChange = jest.fn();
  const user = userEvent.setup();
  render(<Dashboard works={[makeWork({})]} expenses={[]} profile={profile} onTabChange={onTabChange} />);

  await user.click(screen.getByText("💵 현금"));

  expect(onTabChange).toHaveBeenCalledWith("revenue", { month: getThisYm(), payment: "cash" });
});

test("외상 항목을 클릭하면 이번달+외상 필터가 함께 전달된다", async () => {
  const onTabChange = jest.fn();
  const user = userEvent.setup();
  render(<Dashboard works={[makeWork({})]} expenses={[]} profile={profile} onTabChange={onTabChange} />);

  await user.click(screen.getByText("⏳ 외상"));

  expect(onTabChange).toHaveBeenCalledWith("revenue", { month: getThisYm(), payment: "credit" });
});

test("카드 항목을 클릭하면 이번달+카드 필터가 함께 전달된다", async () => {
  const onTabChange = jest.fn();
  const user = userEvent.setup();
  render(<Dashboard works={[makeWork({})]} expenses={[]} profile={profile} onTabChange={onTabChange} />);

  await user.click(screen.getByText("💳 카드"));

  expect(onTabChange).toHaveBeenCalledWith("revenue", { month: getThisYm(), payment: "card" });
});

test("수수료 합계 금액의 폰트 크기가 결제수단별 금액과 동일하다(13px)", () => {
  render(<Dashboard works={[makeWork({ feeAmount: 30000 })]} expenses={[]} profile={profile} onTabChange={()=>{}} />);

  const feeLabel = screen.getByText("이번달 수수료 합계");
  const feeCard = feeLabel.closest("div").parentElement;
  const feeAmountEl = feeCard.querySelector("span");
  expect(feeAmountEl.style.fontSize).toBe("13px");

  // 비교 대상: 현금 항목의 금액 폰트 크기
  const cashAmountEl = screen.getByText("💵 현금").closest("div").querySelector("span:last-child");
  expect(cashAmountEl.style.fontSize).toBe("13px");
});
