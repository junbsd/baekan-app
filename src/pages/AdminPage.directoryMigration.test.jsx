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

const { onSnapshot, setDoc } = require("firebase/firestore");

const adminUser = { email: "junbsd@gmail.com" };

const USERS = [
  { id: "uid-1", name: "이수정", email: "a@test.com", role: "private", companyName: "배관119", phone: "01099998888", businessNumber: "", companyAddress: "", signatureUrl: "", createdAt: "2026-01-01" },
  { id: "uid-2", name: "김철수", email: "b@test.com", role: "team", teamId: "team-x", companyName: "철수설비", phone: "01011112222", createdAt: "2026-01-02" },
  { id: "uid-pending", name: "대기중", email: "c@test.com", role: "pending", createdAt: "2026-01-03" }, // 승인 안 됨 - 제외되어야 함
  { id: "uid-blocked", name: "차단됨", email: "d@test.com", role: "blocked", createdAt: "2026-01-04" }, // 차단됨 - 제외되어야 함
];

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "users") cb({ docs: USERS.map(u => ({ id: u.id, data: () => u })) });
    else cb({ docs: [] });
    return () => {};
  });
});

test("'세부견적서 작성자 목록 동기화' 버튼을 누르면 승인된 사용자만 workerDirectory에 저장되고, 대기중/차단된 사용자는 제외된다", async () => {
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
  const user = userEvent.setup();

  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🔗 세부견적서 작성자 목록 동기화"));

  await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2)); // private 1명 + team 1명 = 2명만

  const savedIds = setDoc.mock.calls.map(call => call[0].__doc[2]);
  expect(savedIds).toContain("uid-1");
  expect(savedIds).toContain("uid-2");
  expect(savedIds).not.toContain("uid-pending");
  expect(savedIds).not.toContain("uid-blocked");

  const savedData = setDoc.mock.calls.find(call => call[0].__doc[2] === "uid-1")[1];
  expect(savedData.name).toBe("이수정");
  expect(savedData.companyName).toBe("배관119");
  expect(savedData.phone).toBe("01099998888");

  expect(window.alert).toHaveBeenCalledWith("완료: 2명의 정보가 동기화되었습니다.");
});

test("확인 창에서 취소하면 동기화가 실행되지 않는다", async () => {
  window.confirm = jest.fn(() => false);
  const user = userEvent.setup();

  render(<AdminPage user={adminUser} />);
  await user.click(screen.getByText("🔗 세부견적서 작성자 목록 동기화"));

  expect(setDoc).not.toHaveBeenCalled();
});
