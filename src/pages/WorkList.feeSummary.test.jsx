import { render, screen } from "@testing-library/react";
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

test("매출일지 화면에 필터링된 작업들의 수수료 합계가 표시된다", () => {
  const works = [
    makeWork({ feeAmount: 30000 }),
    makeWork({ feeAmount: 60000 }),
  ];
  render(<WorkList works={works} profile={profile} />);

  expect(screen.getByText("수수료 합계")).toBeInTheDocument();
  expect(screen.getByText("90,000원")).toBeInTheDocument();
});

test("작업이 없으면 수수료 합계는 0원으로 표시된다", () => {
  render(<WorkList works={[]} profile={profile} />);

  const feeLabel = screen.getByText("수수료 합계");
  const feeRow = feeLabel.closest("div").parentElement;
  expect(feeRow.textContent).toContain("0원");
});
