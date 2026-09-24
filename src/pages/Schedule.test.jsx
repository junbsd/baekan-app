import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Schedule from "./Schedule";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  doc: (...args) => ({ __doc: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-sch" })),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => ({ __query: args }),
  where: (...args) => ({ __where: args }),
  onSnapshot: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { onSnapshot, addDoc } = require("firebase/firestore");

const profile = { uid: "uid-1", name: "이수정" };
const candidates = [
  { id: "uid-1", name: "이수정", companyName: "배관119" },
  { id: "uid-2", name: "박담당", companyName: "배관119" },
];

function mockSnapshots({ schedules = [], directory = candidates }) {
  onSnapshot.mockImplementation((q, cb) => {
    const collArgs = q.__query?.find(a => a && a.__collection)?.__collection;
    const collName = collArgs ? collArgs[1] : null;
    if (collName === "schedules") cb({ docs: schedules.map(s => ({ id: s.id, data: () => s })) });
    else if (collName === "workerDirectory") cb({ docs: directory.map(d => ({ id: d.id, data: () => d })) });
    else cb({ docs: [] });
    return () => {};
  });
}

beforeEach(() => { jest.clearAllMocks(); });

test("예정된 일정이 없으면 안내 문구를 보여준다", () => {
  mockSnapshots({ schedules: [] });
  render(<Schedule works={[]} profile={profile} onStartWork={jest.fn()} onTabChange={jest.fn()} />);
  expect(screen.getByText("예정된 일정이 없습니다")).toBeInTheDocument();
});

test("새 일정 저장 시 날짜만 입력해도 저장되고, 담당자를 여러 명 선택할 수 있다", async () => {
  mockSnapshots({ schedules: [] });
  const user = userEvent.setup();
  render(<Schedule works={[]} profile={profile} onStartWork={jest.fn()} onTabChange={jest.fn()} />);

  await user.click(screen.getByText("➕ 새 일정"));
  await user.click(screen.getByText(/박담당/));
  await user.click(screen.getByText("💾 일정 저장"));

  expect(addDoc).toHaveBeenCalled();
  const [, data] = addDoc.mock.calls[0];
  expect(data.status).toBe("예정");
  expect(data.content).toBe(""); // 시공 내용은 비워둔 채 저장 가능
  expect(data.assigneeUids.sort()).toEqual(["uid-1", "uid-2"]); // 본인 기본 선택 + 추가 선택
});

test("완료된 일정 중 연결된 작업일지를 볼 수 있으면 '작업일지 보기' 버튼이 뜨고 클릭 시 workId로 이동한다", async () => {
  mockSnapshots({
    schedules: [{ id: "sch-1", date: "2026-10-05", time: "09:00", clientCompany: "현대건설",
      status: "완료", workId: "work-1", completedByName: "이수정", assigneeUids: [], assigneeNames: [] }],
  });
  const onTabChange = jest.fn();
  const user = userEvent.setup();
  render(<Schedule works={[{ id: "work-1" }]} profile={profile} onStartWork={jest.fn()} onTabChange={onTabChange} />);

  await user.click(screen.getByText("완료"));
  await user.click(screen.getByText("현대건설"));
  await user.click(screen.getByText("📄 작업일지 보기"));

  expect(onTabChange).toHaveBeenCalledWith("revenue", { workId: "work-1" });
});

test("완료된 일정인데 연결된 작업일지를 볼 권한이 없으면 버튼 대신 안내 문구만 보인다", async () => {
  mockSnapshots({
    schedules: [{ id: "sch-1", date: "2026-10-05", clientCompany: "현대건설",
      status: "완료", workId: "work-other", completedByName: "박담당", assigneeUids: [], assigneeNames: [] }],
  });
  const user = userEvent.setup();
  // works 배열(로그인한 사람 기준으로 이미 필터링된 값)에 work-other가 없음 = 볼 권한 없음
  render(<Schedule works={[]} profile={profile} onStartWork={jest.fn()} onTabChange={jest.fn()} />);

  await user.click(screen.getByText("완료"));
  await user.click(screen.getByText("현대건설"));

  expect(screen.queryByText("📄 작업일지 보기")).not.toBeInTheDocument();
  expect(screen.getByText("이 작업일지를 볼 수 있는 권한이 없습니다.")).toBeInTheDocument();
});

test("예정 상태 일정에서 '이 일정으로 작업일지 작성'을 누르면 onStartWork가 해당 일정과 함께 호출된다", async () => {
  const schedule = { id: "sch-1", date: "2026-10-05", clientCompany: "현대건설", status: "예정", assigneeUids: [], assigneeNames: [] };
  mockSnapshots({ schedules: [schedule] });
  const onStartWork = jest.fn();
  const user = userEvent.setup();
  render(<Schedule works={[]} profile={profile} onStartWork={onStartWork} onTabChange={jest.fn()} />);

  await user.click(screen.getByText("현대건설"));
  await user.click(screen.getByText("🔧 이 일정으로 작업일지 작성"));

  expect(onStartWork).toHaveBeenCalledWith(expect.objectContaining({ id: "sch-1" }));
});
