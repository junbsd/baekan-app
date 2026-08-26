import { render, screen, within } from "@testing-library/react";
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
}));
jest.mock("../firebase", () => ({ db: {} }));

const { onSnapshot, updateDoc } = require("firebase/firestore");

const adminUser = { email: "junbsd@gmail.com" };

const USERS = [
  { id: "u-shared-1", name: "공유작성자1", email: "shared1@test.com", role: "shared", teamId: null, createdAt: "2026-01-01" },
  { id: "u-private-1", name: "개인사용자A", email: "privateA@test.com", role: "private", teamId: null, createdAt: "2026-01-02" },
];
const TEAMS = [
  { id: "team-shared-3", name: "공유3팀", createdAt: "2025-01-01" },
];

beforeEach(() => {
  jest.clearAllMocks();
});

function setupSnapshots() {
  onSnapshot.mockImplementation((q, cb) => {
    // collection(db,"users") 또는 collection(db,"teams") 여부를 __collection 인자로 구분
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collectionName = collArgs ? collArgs[1] : null;
    if (collectionName === "users") {
      cb({ docs: USERS.map(u => ({ id: u.id, data: () => u })) });
    } else if (collectionName === "teams") {
      cb({ docs: TEAMS.map(t => ({ id: t.id, data: () => t })) });
    } else {
      cb({ docs: [] });
    }
    return () => {};
  });
}

// "공유작성자1" 이름이 있는 카드(권한설정 버튼이 정확히 1개인 가장 작은 조상)를 찾아주는 헬퍼
function getUserCard(name) {
  const nameEl = screen.getByText(name);
  let el = nameEl.parentElement;
  while (el) {
    const btns = within(el).queryAllByText(/권한설정/);
    if (btns.length === 1) return el;
    el = el.parentElement;
  }
  throw new Error(`카드를 찾지 못함: ${name}`);
}

test("권한설정 화면에는 더 이상 '공유 사용자' 선택 옵션이 없다 (재발 방지)", async () => {
  setupSnapshots();
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const buttons = screen.getAllByText(/권한설정/);
  await user.click(buttons[0]);

  expect(screen.getByText("👥 팀 사용자")).toBeInTheDocument();
  expect(screen.getByText("👤 개인 사용자")).toBeInTheDocument();
  expect(screen.getByText("🚫 차단")).toBeInTheDocument();
  expect(screen.queryByText("🌐 공유 사용자")).not.toBeInTheDocument();
});

test("기존에 role이 shared였던 사용자의 권한설정을 열면 '팀 사용자'가 기본 선택되어, 관리자가 팀을 지정해 전환하기 쉽다", async () => {
  setupSnapshots();
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const card = getUserCard("공유작성자1");
  const openBtn = within(card).getByText(/권한설정/);
  await user.click(openBtn);

  const teamOptionRow = screen.getByText("👥 팀 사용자").closest("div").parentElement.parentElement;
  expect(teamOptionRow.textContent).toContain("✓");
});

test("관리자가 팀을 선택하고 저장하면 role이 team으로, teamId가 선택한 팀으로 저장된다", async () => {
  setupSnapshots();
  const user = userEvent.setup();
  render(<AdminPage user={adminUser} />);

  const card = getUserCard("공유작성자1");
  const openBtn = within(card).getByText(/권한설정/);
  await user.click(openBtn);

  await user.click(screen.getByText("공유3팀"));
  await user.click(screen.getByText("저장"));

  expect(updateDoc).toHaveBeenCalled();
  const [, savedData] = updateDoc.mock.calls[0];
  expect(savedData.role).toBe("team");
  expect(savedData.teamId).toBe("team-shared-3");
});
