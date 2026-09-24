import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  onSnapshot: jest.fn(),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  addDoc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { onSnapshot, updateDoc, setDoc, getDoc, getDocs, addDoc, deleteDoc } = require("firebase/firestore");

const adminUser = { email: "junbsd@gmail.com" };

function mockUsers(users) {
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "users") cb({ docs: users.map(u => ({ id: u.id, data: () => u })) });
    else cb({ docs: [] });
    return () => {};
  });
}

function getToggleByLabel(cardName, labelText) {
  const nameEl = screen.getByText(cardName);
  let cardEl = nameEl.parentElement;
  while (cardEl) {
    if (within(cardEl).queryAllByText(labelText).length === 1) break;
    cardEl = cardEl.parentElement;
  }
  const labelEl = within(cardEl).getByText(labelText);
  const row = labelEl.closest("div").parentElement.parentElement;
  return within(row).getByRole("switch");
}

beforeEach(() => {
  updateDoc.mockImplementation(() => Promise.resolve());
  setDoc.mockImplementation(() => Promise.resolve());
  getDoc.mockImplementation(() => Promise.resolve({ exists: () => false }));
  getDocs.mockImplementation(() => Promise.resolve({ docs: [] }));
  addDoc.mockImplementation(() => Promise.resolve({ id: "x" }));
  deleteDoc.mockImplementation(() => Promise.resolve());
});

test("일정 권한이 꺼져있는 사용자는 토글이 꺼진 상태(off)로 보인다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", createdAt: "2026-01-01" },
  ]);
  render(<AdminPage user={adminUser} />);

  const toggle = getToggleByLabel("김철수", "📅 일정 사용 허용");
  expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("일정 토글을 켜면 users와 workerDirectory 양쪽에 canUseSchedule=true가 반영된다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", canUseSchedule: false, createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const toggle = getToggleByLabel("김철수", "📅 일정 사용 허용");
  await user.click(toggle);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [userRef, userData] = updateDoc.mock.calls[0];
  expect(userRef.__doc.slice(1)).toEqual(["users", "uid-1"]);
  expect(userData.canUseSchedule).toBe(true);

  await waitFor(() => expect(setDoc).toHaveBeenCalled());
  const [dirRef, dirData, opts] = setDoc.mock.calls[0];
  expect(dirRef.__doc.slice(1)).toEqual(["workerDirectory", "uid-1"]);
  expect(dirData.canUseSchedule).toBe(true);
  expect(opts).toEqual({ merge: true });
});

test("일정 토글은 세부견적서/간이영수증 토글과 독립적으로 동작한다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private",
      canUseDetailedEstimate: false, canUseReceipt: false, canUseSchedule: false, createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const scheduleToggle = getToggleByLabel("김철수", "📅 일정 사용 허용");
  await user.click(scheduleToggle);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, userData] = updateDoc.mock.calls[0];
  expect(userData.canUseSchedule).toBe(true);
  expect(userData.canUseDetailedEstimate).toBeUndefined();
  expect(userData.canUseReceipt).toBeUndefined();
});

test("관리자 본인 카드에는 일정 토글이 표시되지 않는다(항상 사용 가능하므로)", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "admin", approved: true, createdAt: "2026-01-01" },
  ]);
  render(<AdminPage user={adminUser} />);

  await screen.findByText("이준형");
  expect(screen.queryByText("📅 일정 사용 허용")).not.toBeInTheDocument();
});
