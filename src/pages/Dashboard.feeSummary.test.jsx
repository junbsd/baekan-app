import { render, screen } from "@testing-library/react";
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

test("이번달 수수료 합계가 대시보드에 정확히 표시된다", () => {
  const works = [
    makeWork({ feeAmount: 30000 }),
    makeWork({ feeAmount: 60000 }),
  ];
  render(<Dashboard works={works} expenses={[]} profile={profile} onTabChange={()=>{}} />);

  expect(screen.getByText("이번달 수수료 합계")).toBeInTheDocument();
  expect(screen.getByText("90,000원")).toBeInTheDocument();
});

test("이번달 작업이 없으면 수수료 합계는 0원으로 표시된다", () => {
  render(<Dashboard works={[]} expenses={[]} profile={profile} onTabChange={()=>{}} />);

  const feeLabel = screen.getByText("이번달 수수료 합계");
  const feeCard = feeLabel.closest("div").parentElement;
  expect(feeCard.textContent).toContain("0원");
});

test("지난달 작업은 이번달 수수료 합계에 포함되지 않는다", () => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth()-1, 15);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,"0")}-15`;

  const works = [
    makeWork({ feeAmount: 30000 }), // 이번달
    makeWork({ date: lastMonthStr, feeAmount: 999999 }), // 지난달 - 집계에서 제외되어야 함
  ];
  render(<Dashboard works={works} expenses={[]} profile={profile} onTabChange={()=>{}} />);

  expect(screen.getByText("30,000원")).toBeInTheDocument();
  expect(screen.queryByText("1,029,999원")).not.toBeInTheDocument();
});
