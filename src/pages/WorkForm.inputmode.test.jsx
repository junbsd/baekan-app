import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkForm from "./WorkForm";

// Firestore/Storage 호출을 가짜로 대체
jest.mock("firebase/firestore", () => ({
  collection: (...args) => ({ __collection: args }),
  addDoc: jest.fn(() => Promise.resolve({ id: "new-id" })),
  doc: (...args) => ({ __doc: args }),
  updateDoc: jest.fn(() => Promise.resolve()),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: jest.fn(() => Promise.resolve()),
  query: (...args) => ({ __query: args }),
  orderBy: (...args) => ({ __orderBy: args }),
  onSnapshot: jest.fn((q, cb) => { cb({ docs: [] }); return () => {}; }),
}));
jest.mock("firebase/storage", () => ({
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock("../firebase", () => ({ db: {}, storage: {} }));

const { addDoc } = require("firebase/firestore");

const profile = { uid: "uid-test-1", name: "이수정", companyName: "배관119", phone: "01099998888", signatureUrl: "" };

beforeEach(() => { jest.clearAllMocks(); });

test("청구 금액 입력란에 숫자 키패드(inputMode=numeric)가 적용되어 있다", () => {
  render(<WorkForm profile={profile} onSaved={() => {}} onCancel={() => {}} userRole="worker" userTeamId="team1" />);
  const amountInput = screen.getByPlaceholderText("0");
  expect(amountInput).toHaveAttribute("inputmode", "numeric");
  expect(amountInput).toHaveAttribute("type", "number");
});

test("청구 금액 입력란에 숫자를 입력하면 정상적으로 값이 반영된다(inputMode 추가가 기존 입력 동작을 깨지 않음)", async () => {
  const user = userEvent.setup();
  render(<WorkForm profile={profile} onSaved={() => {}} onCancel={() => {}} userRole="worker" userTeamId="team1" />);
  const amountInput = screen.getByPlaceholderText("0");
  await user.type(amountInput, "150000");
  expect(amountInput).toHaveValue(150000);
});

test("수수료 직접입력 필드에도 숫자 키패드(inputMode=numeric)가 적용되어 있다", async () => {
  const user = userEvent.setup();
  render(<WorkForm profile={profile} onSaved={() => {}} onCancel={() => {}} userRole="worker" userTeamId="team1" />);
  // "수수료" 라벨이 있는 카드 안에서 "직접입력" 버튼을 찾아 클릭 (작업시간 섹션과 구분)
  const feeLabel = screen.getByText("💸 수수료");
  const feeCard = feeLabel.closest("div");
  const directInputBtn = within(feeCard.parentElement).getByText("직접입력");
  await user.click(directInputBtn);
  const customFeeInput = screen.getByPlaceholderText("수수료율 입력");
  expect(customFeeInput).toHaveAttribute("inputmode", "numeric");
});

test("개인(private) 사용자가 작업을 저장하면 본인의 uid(createdByUid)가 함께 저장된다", async () => {
  const user = userEvent.setup();
  render(<WorkForm profile={profile} onSaved={() => {}} onCancel={() => {}} userRole="private" userTeamId={null} />);

  await user.type(screen.getByPlaceholderText("발주업체명 입력 후 Enter"), "테스트발주처{Enter}");
  await user.type(screen.getByPlaceholderText("0"), "100000");

  await user.click(screen.getByText("💾 작업 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const calls = addDoc.mock.calls;
  const workCall = calls.find(c => c[1] && c[1].amount === 100000);
  expect(workCall[1].createdByUid).toBe("uid-test-1");
  expect(workCall[1].teamId).toBeNull();
});

test("팀 사용자가 작업을 저장하면 teamId와 본인 uid가 함께 저장된다", async () => {
  const user = userEvent.setup();
  render(<WorkForm profile={profile} onSaved={() => {}} onCancel={() => {}} userRole="team" userTeamId="team-x" />);

  await user.type(screen.getByPlaceholderText("발주업체명 입력 후 Enter"), "팀발주처{Enter}");
  await user.type(screen.getByPlaceholderText("0"), "200000");

  await user.click(screen.getByText("💾 작업 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const calls = addDoc.mock.calls;
  const workCall = calls.find(c => c[1] && c[1].amount === 200000);
  expect(workCall[1].createdByUid).toBe("uid-test-1");
  expect(workCall[1].teamId).toBe("team-x");
});
