import { render, screen, waitFor } from "@testing-library/react";
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

const { onSnapshot, updateDoc } = require("firebase/firestore");

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

beforeEach(() => { jest.clearAllMocks(); });

test("관리자 계정의 role이 pending 등 admin이 아닌 값으로 저장되어 있으면, 복구 안내와 버튼이 표시된다", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "pending", createdAt: "2026-06-06" },
  ]);
  render(<AdminPage user={adminUser} />);

  expect(await screen.findByText(/최고관리자 이메일인데/)).toBeInTheDocument();
  expect(screen.getByText("✅ 관리자 권한으로 복구")).toBeInTheDocument();
});

test("'관리자 권한으로 복구' 버튼을 누르면 role이 admin, approved가 true로 저장된다", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "pending", createdAt: "2026-06-06" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  await user.click(await screen.findByText("✅ 관리자 권한으로 복구"));

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.role).toBe("admin");
  expect(savedData.approved).toBe(true);
  expect(savedData.teamId).toBeNull();
});

test("관리자 계정의 role이 이미 admin으로 정상 저장되어 있으면 복구 안내가 보이지 않는다", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "admin", approved: true, createdAt: "2026-06-06" },
  ]);
  render(<AdminPage user={adminUser} />);

  await screen.findByText("이준형");
  expect(screen.queryByText(/최고관리자 이메일인데/)).not.toBeInTheDocument();
  expect(screen.queryByText("✅ 관리자 권한으로 복구")).not.toBeInTheDocument();
});

test("일반 사용자(관리자 이메일이 아님)에게는 복구 버튼이 뜨지 않는다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "pending", createdAt: "2026-06-06" },
  ]);
  render(<AdminPage user={adminUser} />);

  await screen.findByText("김철수");
  expect(screen.queryByText(/최고관리자 이메일인데/)).not.toBeInTheDocument();
});
