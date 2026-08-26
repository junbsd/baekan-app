import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EstimateForm from "./EstimateForm";

jest.mock("firebase/firestore", () => {
  // where()가 호출되면 어떤 필드/값으로 필터링해야 하는지 기록해두고,
  // onSnapshot 시점에 query에 담긴 where 조건들을 실제로 적용해서 서버단 필터링을 흉내낸다.
  const whereCalls = [];
  return {
    collection: (...args) => ({ __collection: args }),
    addDoc: jest.fn(() => Promise.resolve({ id: "new-id" })),
    doc: (...args) => ({ __doc: args }),
    updateDoc: jest.fn(() => Promise.resolve()),
    deleteDoc: jest.fn(() => Promise.resolve()),
    query: (...args) => {
      const wheres = args.filter(a => a && a.__where).map(a => a.__where);
      return { __wheres: wheres };
    },
    orderBy: (...args) => ({ __orderBy: args }),
    where: (field, op, value) => ({ __where: [field, op, value] }),
    onSnapshot: jest.fn(),
    __whereCalls: whereCalls,
  };
});
jest.mock("../firebase", () => ({ db: {} }));

const { addDoc, onSnapshot } = require("firebase/firestore");

function applyWheres(docs, q) {
  const wheres = (q && q.__wheres) || [];
  return docs.filter(d => wheres.every(([field, op, value]) => {
    if (op === "==") return d[field] === value;
    return true;
  }));
}

// 전체 estimates 컬렉션에 있다고 가정하는 데이터
// (공유팀 2건 + 개인사용자A 1건 + 개인사용자B 1건 + 팀X 1건)
const ALL_ESTIMATES = [
  // 공유팀(3명)도 이제 team과 동일한 teamId 기준으로 분리된다 (Firebase 콘솔에서 role: shared -> team 전환 + teamId 부여 완료 가정)
  { id: "shared-1", issuedTo: "공유팀고객1", workerName: "공유작성자1", teamId: "team-shared-3", createdByUid: "uid-S1", amount: 100000 },
  { id: "shared-2", issuedTo: "공유팀고객2", workerName: "공유작성자2", teamId: "team-shared-3", createdByUid: "uid-S2", amount: 200000 },
  { id: "private-a", issuedTo: "개인A고객", workerName: "개인사용자A", createdByUid: "uid-A", amount: 300000 },
  { id: "private-b", issuedTo: "개인B고객", workerName: "개인사용자B", createdByUid: "uid-B", amount: 400000 },
  { id: "team-x-1", issuedTo: "팀X고객", workerName: "팀X멤버", teamId: "team-x", createdByUid: "uid-T1", amount: 500000 },
];

function mockSnapshotWithAll() {
  onSnapshot.mockImplementation((q, cb) => {
    // EstimateForm.jsx의 쿼리에 where("teamId",...)가 포함되어 있으면 그 조건으로 먼저 걸러낸 뒤 콜백에 전달한다.
    // (실제 Firestore가 서버단에서 하는 일을 동일하게 흉내냄)
    const filtered = applyWheres(ALL_ESTIMATES, q);
    cb({ docs: filtered.map(e => ({ id: e.id, data: () => e })) });
    return () => {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnapshotWithAll();
});

test("개인(private) 사용자는 본인이 작성한 견적서만 보이고, 다른 사람(공유팀/다른 개인)의 견적서는 보이지 않는다", async () => {
  const profileA = { uid: "uid-A", name: "개인사용자A", companyName: "", phone: "01011111111", signatureUrl: "" };
  render(<EstimateForm profile={profileA} userRole="private" userTeamId={null} isAdmin={false} />);

  // 본인 견적서는 보임
  expect(await screen.findByText("개인A고객")).toBeInTheDocument();
  // 다른 사람들의 견적서는 보이지 않음
  expect(screen.queryByText("개인B고객")).not.toBeInTheDocument();
  expect(screen.queryByText("공유팀고객1")).not.toBeInTheDocument();
  expect(screen.queryByText("공유팀고객2")).not.toBeInTheDocument();
  expect(screen.queryByText("팀X고객")).not.toBeInTheDocument();
});

test("다른 개인(private) 사용자로 로그인하면 그 사람 본인의 견적서만 보인다", async () => {
  const profileB = { uid: "uid-B", name: "개인사용자B", companyName: "", phone: "01022222222", signatureUrl: "" };
  render(<EstimateForm profile={profileB} userRole="private" userTeamId={null} isAdmin={false} />);

  expect(await screen.findByText("개인B고객")).toBeInTheDocument();
  expect(screen.queryByText("개인A고객")).not.toBeInTheDocument();
  expect(screen.queryByText("공유팀고객1")).not.toBeInTheDocument();
});

test("공유(shared) 사용자(3명 팀)는 같은 공유팀(teamId)끼리만 보고, 다른 개인/팀의 데이터는 보지 않는다", async () => {
  // 핵심 버그 수정 검증: 예전에는 shared가 무조건 전체 조회였어서 개인 사용자의 데이터까지 보였음.
  // 이제는 shared도 teamId 기준으로 분리되어, 같은 공유팀 데이터만 보여야 한다.
  const sharedProfile = { uid: "uid-S1", name: "공유작성자1", companyName: "", phone: "01033333333", signatureUrl: "" };
  render(<EstimateForm profile={sharedProfile} userRole="shared" userTeamId="team-shared-3" isAdmin={false} />);

  // 같은 공유팀(team-shared-3) 데이터는 둘 다 보임 (3명이 함께 보는 것)
  expect(await screen.findByText("공유팀고객1")).toBeInTheDocument();
  expect(screen.getByText("공유팀고객2")).toBeInTheDocument();
  // 다른 개인/팀 사용자의 데이터는 더 이상 보이지 않아야 함 (이번에 수정한 버그)
  expect(screen.queryByText("개인A고객")).not.toBeInTheDocument();
  expect(screen.queryByText("개인B고객")).not.toBeInTheDocument();
  expect(screen.queryByText("팀X고객")).not.toBeInTheDocument();
});

test("개인 사용자는 공유팀(shared)의 견적서도 보지 않는다(양방향 분리 확인)", async () => {
  const profileA = { uid: "uid-A", name: "개인사용자A", companyName: "", phone: "01011111111", signatureUrl: "" };
  render(<EstimateForm profile={profileA} userRole="private" userTeamId={null} isAdmin={false} />);

  expect(await screen.findByText("개인A고객")).toBeInTheDocument();
  expect(screen.queryByText("공유팀고객1")).not.toBeInTheDocument();
  expect(screen.queryByText("공유팀고객2")).not.toBeInTheDocument();
});

test("아직 teamId가 지정되지 않은 shared 사용자(Firebase 콘솔 마이그레이션 전 상태)는 전체 조회로 새지 않고 안전하게 본인 데이터만 본다", async () => {
  // teamId가 없으면 team/shared 분기 조건(userTeamId 필요)을 만족하지 못해 private과 동일한 안전 경로로 빠진다.
  // 즉 "데이터가 전혀 안 보임"이 "남의 데이터가 다 보임"보다 훨씬 안전한 기본값임을 확인한다.
  const sharedNoTeamProfile = { uid: "uid-S1", name: "공유작성자1", companyName: "", phone: "01033333333", signatureUrl: "" };
  render(<EstimateForm profile={sharedNoTeamProfile} userRole="shared" userTeamId={null} isAdmin={false} />);

  // 본인이 작성한 것(createdByUid가 uid-S1인 항목)만 보임
  expect(await screen.findByText("공유팀고객1")).toBeInTheDocument();
  // 다른 사람 데이터(같은 공유팀의 동료가 작성한 것조차)는 teamId 연결 전이라 보이지 않음 - 마이그레이션을 독려하는 의도된 동작
  expect(screen.queryByText("공유팀고객2")).not.toBeInTheDocument();
  expect(screen.queryByText("개인A고객")).not.toBeInTheDocument();
});

test("팀(team) 사용자는 같은 teamId를 가진 견적서만 클라이언트 필터를 통과해 보인다", async () => {
  const teamProfile = { uid: "uid-T1", name: "팀X멤버", companyName: "", phone: "01044444444", signatureUrl: "" };
  render(<EstimateForm profile={teamProfile} userRole="team" userTeamId="team-x" isAdmin={false} />);

  expect(await screen.findByText("팀X고객")).toBeInTheDocument();
  // 다른 팀/개인/공유 데이터는 보이지 않아야 함
  expect(screen.queryByText("개인A고객")).not.toBeInTheDocument();
  expect(screen.queryByText("공유팀고객1")).not.toBeInTheDocument();
});

test("개인 사용자가 새 견적서를 저장하면 본인의 uid(createdByUid)가 함께 저장된다", async () => {
  const profileA = { uid: "uid-A", name: "개인사용자A", companyName: "배관A", phone: "01011111111", signatureUrl: "" };
  // 이 테스트에서는 본인 견적서가 비어있다고 가정(새로 작성하는 시나리오)
  onSnapshot.mockImplementation((q, cb) => { cb({ docs: [] }); return () => {}; });

  const user = userEvent.setup();
  render(<EstimateForm profile={profileA} userRole="private" userTeamId={null} isAdmin={false} />);

  await user.click(screen.getByText("📋 새 견적서 작성"));
  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "신규고객님");
  await user.type(screen.getByPlaceholderText("시공 장소 주소"), "서울시 송파구");
  const amountInput = screen.getAllByPlaceholderText("0")[1];
  await user.type(amountInput, "110000");

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.createdByUid).toBe("uid-A");
  expect(savedData.teamId).toBeNull();
});

test("팀 사용자가 새 견적서를 저장하면 teamId와 본인 uid가 함께 저장된다", async () => {
  const teamProfile = { uid: "uid-T1", name: "팀X멤버", companyName: "팀X", phone: "01044444444", signatureUrl: "" };
  onSnapshot.mockImplementation((q, cb) => { cb({ docs: [] }); return () => {}; });

  const user = userEvent.setup();
  render(<EstimateForm profile={teamProfile} userRole="team" userTeamId="team-x" isAdmin={false} />);

  await user.click(screen.getByText("📋 새 견적서 작성"));
  await user.type(screen.getByPlaceholderText("예: 홍길동님, OO공인중개사 등"), "팀신규고객님");
  await user.type(screen.getByPlaceholderText("시공 장소 주소"), "서울시 강동구");
  const amountInput = screen.getAllByPlaceholderText("0")[1];
  await user.type(amountInput, "55000");

  await user.click(screen.getByText("💾 견적서 저장"));

  await waitFor(() => expect(addDoc).toHaveBeenCalled());
  const [, savedData] = addDoc.mock.calls[0];
  expect(savedData.createdByUid).toBe("uid-T1");
  expect(savedData.teamId).toBe("team-x");
});

test("createdByUid가 없는 과거 데이터도, 이름이 본인과 일치하면 개인 사용자에게 정상적으로 보인다(과거 데이터 호환)", async () => {
  // 과거에 저장된 견적서(uid 필드 없음, workerName만 있음)를 본인 것으로 인식하는지 확인
  const legacyEstimates = [
    { id: "legacy-1", issuedTo: "과거고객", workerName: "김과거", amount: 70000 }, // createdByUid 없음
  ];
  onSnapshot.mockImplementation((q, cb) => {
    cb({ docs: legacyEstimates.map(e => ({ id: e.id, data: () => e })) });
    return () => {};
  });

  const legacyProfile = { uid: "uid-legacy", name: "김과거", companyName: "", phone: "01055555555", signatureUrl: "" };
  render(<EstimateForm profile={legacyProfile} userRole="private" userTeamId={null} isAdmin={false} />);

  expect(await screen.findByText("과거고객")).toBeInTheDocument();
});
