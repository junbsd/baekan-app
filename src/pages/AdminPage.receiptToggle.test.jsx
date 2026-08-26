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

// 화면에 세부견적서/간이영수증 토글 2개가 함께 있으므로, 라벨 텍스트를 기준으로 정확한 스위치를 찾는다.
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

beforeEach(() => { jest.clearAllMocks(); });

test("간이영수증 권한이 꺼져있는 사용자는 토글이 꺼진 상태(off)로 보인다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", createdAt: "2026-01-01" },
  ]);
  render(<AdminPage user={adminUser} />);

  const toggle = getToggleByLabel("김철수", "🧾 간이영수증 사용 허용");
  expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("간이영수증 토글을 켜면 canUseReceipt가 true로 저장된다", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", canUseReceipt: false, createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const toggle = getToggleByLabel("김철수", "🧾 간이영수증 사용 허용");
  await user.click(toggle);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.canUseReceipt).toBe(true);
});

test("세부견적서 토글과 간이영수증 토글은 서로 독립적으로 동작한다(하나를 켜도 다른 하나는 영향받지 않음)", async () => {
  mockUsers([
    { id: "uid-1", name: "김철수", email: "b@test.com", role: "private", canUseDetailedEstimate: false, canUseReceipt: false, createdAt: "2026-01-01" },
  ]);
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const receiptToggle = getToggleByLabel("김철수", "🧾 간이영수증 사용 허용");
  await user.click(receiptToggle);

  await waitFor(() => expect(updateDoc).toHaveBeenCalled());
  const [, savedData] = updateDoc.mock.calls[0];
  // 간이영수증만 저장 데이터에 포함되어야 하고, 세부견적서 값은 이 요청에 없어야 함(서로 독립적)
  expect(savedData.canUseReceipt).toBe(true);
  expect(savedData.canUseDetailedEstimate).toBeUndefined();
});

test("관리자 본인 카드에는 간이영수증 토글이 표시되지 않는다(항상 사용 가능하므로)", async () => {
  mockUsers([
    { id: "uid-admin", name: "이준형", email: "junbsd@gmail.com", role: "admin", approved: true, createdAt: "2026-01-01" },
  ]);
  render(<AdminPage user={adminUser} />);

  await screen.findByText("이준형");
  expect(screen.queryByText("🧾 간이영수증 사용 허용")).not.toBeInTheDocument();
});
