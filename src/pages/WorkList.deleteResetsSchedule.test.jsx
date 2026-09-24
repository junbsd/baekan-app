import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkList from "./WorkList";

jest.mock("firebase/firestore", () => ({
  doc: (...args) => ({ __doc: args }),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  collection: (...args) => ({ __collection: args }),
  query: (...args) => ({ __query: args }),
  where: (...args) => ({ __where: args }),
  onSnapshot: jest.fn((q, cb) => { cb({ docs: [] }); return () => {}; }),
}));
jest.mock("firebase/storage", () => ({ ref: jest.fn(), deleteObject: jest.fn(() => Promise.resolve()) }));
jest.mock("../firebase", () => ({ db: {}, storage: {} }));

const { deleteDoc, updateDoc } = require("firebase/firestore");

const profile = { name: "이수정", companyName: "배관119" };

beforeEach(() => {
  deleteDoc.mockImplementation(() => Promise.resolve());
  updateDoc.mockImplementation(() => Promise.resolve());
});

test("일정에서 작성된 작업일지를 삭제하면 연결된 일정이 다시 '예정' 상태로 되돌아간다", async () => {
  const work = {
    id: "work-1", date: "2026-01-15", clientCompany: "고객사", location: "서울",
    amount: 100000, feeRate: 0, feeAmount: 0, netAmount: 100000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
    scheduleId: "sch-1",
  };
  const user = userEvent.setup();
  render(<WorkList works={[work]} profile={profile} initialFilter={{ workId: "work-1" }} />);

  await screen.findByText("작업 상세");
  await user.click(screen.getByText("🗑 삭제"));
  await user.click(screen.getByText("삭제 확인"));

  expect(deleteDoc).toHaveBeenCalled();
  expect(updateDoc).toHaveBeenCalled();
  const [scheduleRef, data] = updateDoc.mock.calls[0];
  expect(scheduleRef.__doc.slice(1)).toEqual(["schedules", "sch-1"]);
  expect(data.status).toBe("예정");
  expect(data.workId).toBeNull();
});

test("일정과 연결되지 않은 일반 작업일지를 삭제하면 schedules 업데이트를 호출하지 않는다", async () => {
  const work = {
    id: "work-2", date: "2026-01-15", clientCompany: "고객사2", location: "서울",
    amount: 100000, feeRate: 0, feeAmount: 0, netAmount: 100000,
    payment: "cash", workerName: "이수정", workerCompany: "배관119",
  };
  const user = userEvent.setup();
  render(<WorkList works={[work]} profile={profile} initialFilter={{ workId: "work-2" }} />);

  await screen.findByText("작업 상세");
  await user.click(screen.getByText("🗑 삭제"));
  await user.click(screen.getByText("삭제 확인"));

  expect(deleteDoc).toHaveBeenCalled();
  expect(updateDoc).not.toHaveBeenCalled();
});
