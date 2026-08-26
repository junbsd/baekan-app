import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  onSnapshot: jest.fn(),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-team-id" })),
  setDoc: jest.fn(() => Promise.resolve()),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  getDocs: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { onSnapshot, updateDoc, getDocs } = require("firebase/firestore");

const adminUser = { email: "junbsd@gmail.com" };

// 공유3팀에 이미 묶인 멤버 3명 (uid-S1, uid-S2, uid-S3)
const USERS = [
  { id: "uid-S1", name: "공유작성자1", email: "s1@test.com", role: "team", teamId: "team-shared-3", createdAt: "2026-01-01" },
  { id: "uid-S2", name: "공유작성자2", email: "s2@test.com", role: "team", teamId: "team-shared-3", createdAt: "2026-01-02" },
  { id: "uid-S3", name: "공유작성자3", email: "s3@test.com", role: "team", teamId: "team-shared-3", createdAt: "2026-01-03" },
];
const TEAMS = [
  { id: "team-shared-3", name: "공유3팀", createdAt: "2025-01-01" },
];

// 팀 배정 전(teamId 없음)에 작성된 과거 데이터들
const LEGACY_WORKS = [
  { id: "w1", clientCompany: "고객1", workerName: "공유작성자1", createdByUid: "uid-S1" }, // teamId 없음
  { id: "w2", clientCompany: "고객2", workerName: "공유작성자2", createdByUid: "uid-S2" }, // teamId 없음
  { id: "w3", clientCompany: "고객3", workerName: "다른사람" }, // 팀 멤버 아님, createdByUid도 없음
  { id: "w4", clientCompany: "고객4", workerName: "공유작성자3", teamId: "other-team" }, // 이미 다른 팀에 연결됨(건드리면 안 됨)
];
const LEGACY_EXPENSES = [
  { id: "e1", desc: "지출1", workerName: "공유작성자1", createdByUid: "uid-S1" }, // teamId 없음
];
const LEGACY_ESTIMATES = [
  { id: "es1", issuedTo: "고객A", workerName: "공유작성자2", createdByUid: "uid-S2" }, // teamId 없음
  { id: "es2", issuedTo: "고객B", workerName: "김과거" }, // createdByUid 없는 아주 오래된 데이터, 이름도 매칭 안됨
];

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collectionName = collArgs ? collArgs[1] : null;
    if (collectionName === "users") cb({ docs: USERS.map(u => ({ id: u.id, data: () => u })) });
    else if (collectionName === "teams") cb({ docs: TEAMS.map(t => ({ id: t.id, data: () => t })) });
    else cb({ docs: [] });
    return () => {};
  });

  getDocs.mockImplementation((q) => {
    const collName = q.__collection?.[1];
    const map = { works: LEGACY_WORKS, expenses: LEGACY_EXPENSES, estimates: LEGACY_ESTIMATES };
    const docs = (map[collName] || []).map(d => ({ id: d.id, data: () => d }));
    return Promise.resolve({ docs });
  });
});

function getTeamCard(teamName) {
  const nameEl = screen.getByText(teamName);
  let el = nameEl.parentElement;
  while (el) {
    if (within(el).queryAllByText(/팀 배정 전 기존 데이터 연결하기/).length === 1) return el;
    el = el.parentElement;
  }
  throw new Error("팀 카드를 찾지 못함");
}

test("관리자가 '팀 배정 전 기존 데이터 연결하기'를 누르면, 해당 팀 멤버가 작성한 teamId 없는 데이터만 정확히 이 팀으로 연결된다", async () => {
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
  const user = userEvent.setup();

  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🏷 팀 관리 (1)"));

  const card = getTeamCard("공유3팀");
  const btn = within(card).getByText(/팀 배정 전 기존 데이터 연결하기/);
  await user.click(btn);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());

  // teamId가 없던 멤버 작성 데이터(w1, w2, e1, es1)만 업데이트되어야 함 = 4건
  expect(updateDoc).toHaveBeenCalledTimes(4);

  const updatedIds = updateDoc.mock.calls.map(call => call[0].__doc[2]);
  expect(updatedIds).toContain("w1");
  expect(updatedIds).toContain("w2");
  expect(updatedIds).toContain("e1");
  expect(updatedIds).toContain("es1");

  // 모두 team-shared-3로 연결되어야 함
  updateDoc.mock.calls.forEach(call => {
    expect(call[1]).toEqual({ teamId: "team-shared-3" });
  });

  // 팀 멤버가 아닌 사람(w3)이나 이미 다른 팀에 연결된 데이터(w4), 이름도 매칭 안되는 더 오래된 데이터(es2)는 건드리지 않음
  expect(updatedIds).not.toContain("w3");
  expect(updatedIds).not.toContain("w4");
  expect(updatedIds).not.toContain("es2");
});

test("연결할 기존 데이터가 없으면 안내 메시지를 보여주고 아무것도 업데이트하지 않는다", async () => {
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
  // 멤버가 작성한 데이터가 전혀 없는 상태로 재설정
  getDocs.mockImplementation(() => Promise.resolve({ docs: [] }));

  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🏷 팀 관리 (1)"));

  const card = getTeamCard("공유3팀");
  const btn = within(card).getByText(/팀 배정 전 기존 데이터 연결하기/);
  await user.click(btn);

  await waitFor(() => expect(window.alert).toHaveBeenCalled());
  expect(updateDoc).not.toHaveBeenCalled();
  expect(window.alert.mock.calls[0][0]).toContain("연결할 기존 데이터가 없습니다");
});

test("멤버가 없는 팀에서는 확인창 없이 즉시 안내만 뜨고 아무 작업도 하지 않는다", async () => {
  window.alert = jest.fn();
  window.confirm = jest.fn();
  // 멤버가 0명인 팀으로 재설정
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collectionName = collArgs ? collArgs[1] : null;
    if (collectionName === "users") cb({ docs: [] }); // 멤버 없음
    else if (collectionName === "teams") cb({ docs: TEAMS.map(t => ({ id: t.id, data: () => t })) });
    else cb({ docs: [] });
    return () => {};
  });

  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🏷 팀 관리 (1)"));

  const card = getTeamCard("공유3팀");
  const btn = within(card).getByText(/팀 배정 전 기존 데이터 연결하기/);
  await user.click(btn);

  expect(window.alert).toHaveBeenCalledWith("이 팀에 아직 멤버가 없습니다.");
  expect(window.confirm).not.toHaveBeenCalled();
  expect(getDocs).not.toHaveBeenCalled();
});

test("확인 창에서 취소하면 마이그레이션이 실행되지 않는다", async () => {
  window.confirm = jest.fn(() => false);
  const user = userEvent.setup();

  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🏷 팀 관리 (1)"));

  const card = getTeamCard("공유3팀");
  const btn = within(card).getByText(/팀 배정 전 기존 데이터 연결하기/);
  await user.click(btn);

  expect(window.confirm).toHaveBeenCalled();
  expect(getDocs).not.toHaveBeenCalled();
  expect(updateDoc).not.toHaveBeenCalled();
});
