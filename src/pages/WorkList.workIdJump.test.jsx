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
  return {
    id: "work-1", date: "2026-01-15", clientCompany: "일정에서온고객", location: "서울",
    amount: 100000, feeRate: 0, feeAmount: 0, netAmount: 100000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
    ...overrides,
  };
}

test("일정 화면에서 workId로 넘어오면, 해당 작업이 이번 달이 아니어도 상세 모달이 바로 열린다", () => {
  const works = [makeWork()]; // 2026-01, 오늘(현재 월)과 다른 달
  render(<WorkList works={works} profile={profile} initialFilter={{ workId: "work-1" }} />);

  // 목록 화면(월별 필터) 대신 상세 모달의 "작업 상세" 헤더가 바로 보여야 한다
  expect(screen.getByText("작업 상세")).toBeInTheDocument();
  expect(screen.getByText("일정에서온고객")).toBeInTheDocument();
});

test("workId가 없으면 기존처럼 목록 화면이 먼저 보인다", () => {
  const works = [makeWork()];
  render(<WorkList works={works} profile={profile} />);
  expect(screen.queryByText("작업 상세")).not.toBeInTheDocument();
});
