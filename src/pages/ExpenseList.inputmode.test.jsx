import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExpenseList from "./ExpenseList";

jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-id" })),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
}));
jest.mock("../firebase", () => ({ db: {} }));

const { addDoc } = require("firebase/firestore");

beforeEach(() => { jest.clearAllMocks(); });

test("지출 입력 모달의 금액란에 숫자 키패드(inputMode=numeric)가 적용되어 있다", async () => {
  const user = userEvent.setup();
  render(<ExpenseList expenses={[]} userRole="worker" userTeamId="team1" profile={{}} />);

  await user.click(screen.getByText("➕ 지출 추가"));
  const amountInput = screen.getByPlaceholderText("0");
  expect(amountInput).toHaveAttribute("inputmode", "numeric");
  expect(amountInput).toHaveAttribute("type", "number");
});

test("지출 금액란에 숫자를 입력하면 정상적으로 값이 반영된다(inputMode 추가가 기존 입력 동작을 깨지 않음)", async () => {
  const user = userEvent.setup();
  render(<ExpenseList expenses={[]} userRole="worker" userTeamId="team1" profile={{}} />);

  await user.click(screen.getByText("➕ 지출 추가"));
  const amountInput = screen.getByPlaceholderText("0");
  await user.type(amountInput, "25000");
  expect(amountInput).toHaveValue(25000);
});

test("개인(private) 사용자가 지출을 저장하면 본인의 uid(createdByUid)와 이름이 함께 저장된다", async () => {
  const profile = { uid: "uid-private-1", name: "개인사용자A", companyName: "" };
  const user = userEvent.setup();
  render(<ExpenseList expenses={[]} userRole="private" userTeamId={null} profile={profile} />);

  await user.click(screen.getByText("➕ 지출 추가"));
  await user.type(screen.getByPlaceholderText("0"), "30000");
  await user.click(screen.getByText("저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.createdByUid).toBe("uid-private-1");
  expect(savedData.workerName).toBe("개인사용자A");
  expect(savedData.teamId).toBeNull();
});

test("팀 사용자가 지출을 저장하면 teamId와 본인 uid가 함께 저장된다", async () => {
  const profile = { uid: "uid-team-1", name: "팀멤버", companyName: "" };
  const user = userEvent.setup();
  render(<ExpenseList expenses={[]} userRole="team" userTeamId="team-x" profile={profile} />);

  await user.click(screen.getByText("➕ 지출 추가"));
  await user.type(screen.getByPlaceholderText("0"), "15000");
  await user.click(screen.getByText("저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.createdByUid).toBe("uid-team-1");
  expect(savedData.teamId).toBe("team-x");
});
