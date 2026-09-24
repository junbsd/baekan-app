import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as fs from "firebase/firestore";
import * as fa from "firebase/auth";
import App from "./App";

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(), signInWithPopup: jest.fn(), signOut: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({
  collection: (...a) => ({ __collection: a[1] }),
  query: (c, ...rest) => ({ __query: c.__collection }),
  where: () => ({}), orderBy: () => ({}),
  doc: (...a) => ({ __doc: a.slice(1), id: a[a.length-1] }),
  getDoc: jest.fn(), onSnapshot: jest.fn(),
  updateDoc: jest.fn(), deleteDoc: jest.fn(), addDoc: jest.fn(), setDoc: jest.fn(), getDocs: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock("firebase/storage", () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock("./firebase", () => ({ db: {}, auth: {}, googleProvider: {}, storage: {} }));

const ym = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();

const scheduleDoc = {
  id: "sch-1", date: `${ym}-20`, time: "09:00", clientCompany: "신규건설",
  location: "부산", content: "", memo: "", status: "예정",
  assigneeUids: ["u1"], assigneeNames: ["이수정"], workId: null,
};
const candidate = { id: "u1", name: "이수정", companyName: "배관119", canUseSchedule: true };

const batchMock = { set: jest.fn(), update: jest.fn(), commit: jest.fn(() => Promise.resolve()) };

function setupSnapshots(profile) {
  const snap = { exists: () => true, data: () => profile };
  fs.getDoc.mockResolvedValue(snap);
  fs.onSnapshot.mockImplementation((ref, cb) => {
    if (ref.__doc) { cb(snap); return () => {}; }
    if (ref.__query === "works") { cb({ docs: [] }); return () => {}; }
    if (ref.__query === "schedules") { cb({ docs: [{ id: scheduleDoc.id, data: () => scheduleDoc }] }); return () => {}; }
    if (ref.__query === "workerDirectory") { cb({ docs: [{ id: candidate.id, data: () => candidate }] }); return () => {}; }
    cb({ docs: [] });
    return () => {};
  });
}

beforeEach(() => {
  fa.onAuthStateChanged.mockImplementation((_a, cb) => { cb({ uid: "u1", email: "x@y.com" }); return () => {}; });
  fs.writeBatch.mockReturnValue(batchMock);
  batchMock.set.mockClear(); batchMock.update.mockClear(); batchMock.commit.mockClear();
});

test("canUseSchedule이 꺼져있으면 하단 메뉴에 '일정' 탭이 보이지 않는다", async () => {
  setupSnapshots({ uid: "u1", name: "이수정", role: "private", approved: true, canUseSchedule: false });
  render(<App />);
  await screen.findByText("대시보드");
  expect(screen.queryByText("일정")).not.toBeInTheDocument();
});

test("canUseSchedule이 켜져있으면 '일정' 탭이 보이고, 탭을 누르면 일정 목록이 뜬다", async () => {
  setupSnapshots({ uid: "u1", name: "이수정", role: "private", approved: true, canUseSchedule: true });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByText("일정"));
  expect(await screen.findByText("신규건설")).toBeInTheDocument();
});

test("일정 상세에서 '작업일지 작성'으로 넘어가면 날짜/발주업체가 미리 채워지고, 저장하면 일정이 완료 처리되며 대시보드로 돌아간다", async () => {
  setupSnapshots({ uid: "u1", name: "이수정", role: "private", approved: true, canUseSchedule: true });
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByText("일정"));
  await user.click(await screen.findByText("신규건설"));
  await user.click(await screen.findByText("🔧 이 일정으로 작업일지 작성"));

  // 작업입력 화면으로 이동, 발주업체가 미리 채워져 있어야 함
  expect(await screen.findByText("작업 기록 입력")).toBeInTheDocument();
  expect(screen.getAllByText("신규건설").length).toBeGreaterThan(0);

  await user.type(screen.getByPlaceholderText("0"), "200000");
  await user.click(screen.getByText(/작업 저장/));

  expect(fs.writeBatch).toHaveBeenCalled();
  expect(batchMock.update).toHaveBeenCalledTimes(1);
  const [scheduleRef, updateData] = batchMock.update.mock.calls[0];
  expect(scheduleRef.__doc).toEqual(["schedules", "sch-1"]);
  expect(updateData.status).toBe("완료");

  // 저장 완료(onSaved) 후 대시보드로 돌아간다 (작업입력 화면이 사라지고, 대시보드 전용 카드가 보임)
  expect(await screen.findByText("이번달 순이익", {}, { timeout: 3000 })).toBeInTheDocument();
  expect(screen.queryByText("작업 기록 입력")).not.toBeInTheDocument();
});
