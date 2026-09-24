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
    amount: 100000, feeRate: 0, feeAmount: 0, netAmount: 100000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
    ...overrides,
  };
}

function getThisYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
}

test("initialFilter로 결제수단이 전달되면, 진입 즉시 해당 결제수단만 필터링되어 보인다", () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  render(<WorkList works={works} profile={profile} initialFilter={{ month: getThisYm(), payment: "credit" }} />);

  expect(screen.queryByText("현금고객")).not.toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});

test("initialFilter에 payment가 빈 문자열이면 전체 목록이 보인다(순이익 카드 클릭 시나리오)", () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  render(<WorkList works={works} profile={profile} initialFilter={{ month: getThisYm(), payment: "" }} />);

  expect(screen.getByText("현금고객")).toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});

test("initialFilter가 없으면(직접 매출 탭 클릭) 기존처럼 필터 없이 전체가 보인다", () => {
  const works = [
    makeWork({ clientCompany: "현금고객", payment: "cash" }),
    makeWork({ clientCompany: "외상고객", payment: "credit" }),
  ];
  render(<WorkList works={works} profile={profile} />);

  expect(screen.getByText("현금고객")).toBeInTheDocument();
  expect(screen.getByText("외상고객")).toBeInTheDocument();
});
