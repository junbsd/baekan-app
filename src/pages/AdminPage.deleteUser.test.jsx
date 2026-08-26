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
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { onSnapshot, deleteDoc } = require("firebase/firestore");

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

function getUserCard(name) {
  const nameEl = screen.getByText(name);
  let el = nameEl.parentElement;
  while (el) {
    if (within(el).queryAllByText("🗑 삭제").length === 1) return el;
    el = el.parentElement;
  }
  throw new Error(`카드를 찾지 못함: ${name}`);
}

beforeEach(() => { jest.clearAllMocks(); });

test("일반 사용자 카드에 삭제 버튼을 누르고 확인하면 users, workerDirectory 문서가 모두 삭제된다", async () => {
  window.confirm = jest.fn(() => true);
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const card = getUserCard("김철수");
  await user.click(within(card).getByText("🗑 삭제"));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("김철수"));
  await waitFor(() => expect(deleteDoc).toHaveBeenCalledTimes(2));

  const deletedIds = deleteDoc.mock.calls.map(call => call[0].__doc[2]);
  expect(deletedIds).toContain("uid-1"); // users/uid-1과 workerDirectory/uid-1 둘 다 uid-1
});

test("확인 창에서 취소하면 삭제가 실행되지 않는다", async () => {
  window.confirm = jest.fn(() => false);
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const card = getUserCard("김철수");
  await user.click(within(card).getByText("🗑 삭제"));

  expect(deleteDoc).not.toHaveBeenCalled();
});

test("관리자 본인 카드에는 삭제 버튼이 표시되지 않는다", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "admin", approved: true, createdAt: "2026-01-01" },
  ]);
  render(<AdminPage user={adminUser} />);

  await screen.findByText("이준형");
  expect(screen.queryByText("🗑 삭제")).not.toBeInTheDocument();
});

test("사용자를 삭제해도 작업·지출·견적서 등 그 사람이 작성한 데이터 컬렉션에는 어떤 삭제 요청도 가지 않는다", async () => {
  window.confirm = jest.fn(() => true);
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const card = getUserCard("김철수");
  await user.click(within(card).getByText("🗑 삭제"));

  await waitFor(() => expect(deleteDoc).toHaveBeenCalled());

  // deleteDoc이 호출될 때 사용된 컬렉션 이름만 정확히 확인 (users, workerDirectory 외에는 절대 없어야 함)
  const deletedCollections = deleteDoc.mock.calls.map(call => call[0].__doc[1]);
  expect(deletedCollections.sort()).toEqual(["users", "workerDirectory"]);
  expect(deletedCollections).not.toContain("works");
  expect(deletedCollections).not.toContain("expenses");
  expect(deletedCollections).not.toContain("estimates");
  expect(deletedCollections).not.toContain("detailedEstimates");
  expect(deletedCollections).not.toContain("opinions");
});
