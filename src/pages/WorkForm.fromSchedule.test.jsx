import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkForm from "./WorkForm";

const batchMock = { set: jest.fn(), update: jest.fn(), commit: jest.fn(() => Promise.resolve()) };

// CRA의 jest 기본 설정(resetMocks:true)은 매 테스트 시작 전 mock 구현을 전부 지우므로,
// jest.mock 팩토리 안에서 지정한 구현이 아니라 beforeEach에서 매번 다시 지정해야 한다.
jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  addDoc: jest.fn(),
  doc: (...args) => ({ __doc: args, id: args.length > 1 ? args[args.length-1] : "auto-work-id" }),
  updateDoc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(),
}));
jest.mock("firebase/storage", () => ({
  ref: jest.fn(), uploadBytesResumable: jest.fn(), getDownloadURL: jest.fn(), deleteObject: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {}, storage: {} }));

const { addDoc, getDoc, setDoc, onSnapshot, writeBatch } = require("firebase/firestore");

const profile = { uid: "uid-1", name: "이수정", companyName: "배관119", phone: "01099998888", signatureUrl: "" };

const schedule = {
  id: "sch-1", date: "2026-10-05", time: "09:30",
  clientCompany: "현대건설", location: "서울시 강남구", content: "", memo: "",
  assigneeUids: ["uid-1"], assigneeNames: ["이수정"], status: "예정", workId: null,
};

beforeEach(() => {
  addDoc.mockImplementation(() => Promise.resolve({ id: "new-id" }));
  getDoc.mockImplementation(() => Promise.resolve({ exists: () => false }));
  setDoc.mockImplementation(() => Promise.resolve());
  onSnapshot.mockImplementation((q, cb) => { cb({ docs: [] }); return () => {}; });
  writeBatch.mockReturnValue(batchMock);
  batchMock.set.mockClear(); batchMock.update.mockClear(); batchMock.commit.mockClear();
});

test("일정에서 넘어오면 날짜/발주업체/장소가 미리 채워지고, 시공내용은 비어 있다", () => {
  render(<WorkForm profile={profile} fromSchedule={schedule} onSaved={()=>{}} userTeamId="t1" />);
  expect(screen.getByDisplayValue("2026-10-05")).toBeInTheDocument();
  expect(screen.getAllByText("현대건설").length).toBeGreaterThan(0);
  expect(screen.getByPlaceholderText("예: 서울시 강남구 역삼동 123")).toHaveValue("서울시 강남구");
  expect(screen.getByPlaceholderText("시공 내용을 상세히 입력하세요")).toHaveValue("");
});

test("일정 안내 배너가 표시되고, 저장 시 addDoc이 아니라 배치로 작업일지 생성+일정 완료 처리가 함께 이뤄진다", async () => {
  const user = userEvent.setup();
  const onSaved = jest.fn();
  render(<WorkForm profile={profile} fromSchedule={schedule} onSaved={onSaved} userTeamId="t1" />);

  expect(screen.getByText(/일정으로 작성 중/)).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("0"), "100000");
  await user.click(screen.getByText(/작업 저장/));

  expect(addDoc).not.toHaveBeenCalled();
  expect(writeBatch).toHaveBeenCalled();
  expect(batchMock.set).toHaveBeenCalledTimes(1);
  const [, workData] = batchMock.set.mock.calls[0];
  expect(workData.scheduleId).toBe("sch-1");
  expect(workData.clientCompany).toBe("현대건설");

  expect(batchMock.update).toHaveBeenCalledTimes(1);
  const [scheduleRef, scheduleUpdate] = batchMock.update.mock.calls[0];
  expect(scheduleRef.__doc.slice(1)).toEqual(["schedules", "sch-1"]);
  expect(scheduleUpdate.status).toBe("완료");
  expect(scheduleUpdate.workId).toBe("auto-work-id");
  expect(scheduleUpdate.completedByName).toBe("이수정");

  expect(batchMock.commit).toHaveBeenCalled();
});

test("일정 없이 일반적으로 작성하면 기존처럼 addDoc으로 저장되고 배치를 쓰지 않는다", async () => {
  const user = userEvent.setup();
  render(<WorkForm profile={profile} onSaved={()=>{}} userTeamId="t1" />);
  await user.type(screen.getByPlaceholderText("발주업체명 입력 후 Enter"), "테스트업체{Enter}");
  await user.type(screen.getByPlaceholderText("0"), "50000");
  await user.click(screen.getByText(/작업 저장/));

  expect(writeBatch).not.toHaveBeenCalled();
  expect(addDoc).toHaveBeenCalled();
});
