import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as fs from "firebase/firestore";
import * as fa from "firebase/auth";
import App from "./App";

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(), signInWithPopup: jest.fn(), signOut: jest.fn(),
}));
jest.mock("firebase/firestore", () => ({
  collection: (...a) => ({ __collection: a[1] }),
  query: (c, ...rest) => ({ __query: c.__collection }),
  where: () => ({}), orderBy: () => ({}),
  doc: (...a) => ({ __doc: a.slice(1) }),
  getDoc: jest.fn(), onSnapshot: jest.fn(),
  updateDoc: jest.fn(), deleteDoc: jest.fn(), addDoc: jest.fn(), setDoc: jest.fn(), getDocs: jest.fn(),
}));
jest.mock("firebase/storage", () => ({ ref: jest.fn(), deleteObject: jest.fn() }));
jest.mock("./firebase", () => ({ db: {}, auth: {}, googleProvider: {}, storage: {} }));

const ym = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();
const profile = { uid:"u1", name:"이수정", role:"team", teamId:"t1", approved:true };
const works = [
  { id:"w1", date:`${ym}-10`, clientCompany:"현금업체", payment:"cash", amount:100000, netAmount:100000, createdAt:"2", teamId:"t1", workerName:"이수정" },
  { id:"w2", date:`${ym}-11`, clientCompany:"외상업체", payment:"credit", amount:50000, netAmount:50000, createdAt:"1", teamId:"t1", workerName:"이수정" },
];

// CRA 기본값 resetMocks:true 때문에 mock 구현은 반드시 beforeEach에서 지정해야 함
beforeEach(() => {
  fa.onAuthStateChanged.mockImplementation((_a, cb) => { cb({ uid:"u1", email:"x@y.com" }); return () => {}; });
  const snap = { exists: () => true, data: () => profile };
  fs.getDoc.mockResolvedValue(snap);
  fs.onSnapshot.mockImplementation((ref, cb) => {
    if (ref.__doc) cb(snap);
    else if (ref.__query === "works") cb({ docs: works.map(w => ({ id:w.id, data:()=>w })) });
    else cb({ docs: [] });
    return () => {};
  });
});

test("순이익 카드 클릭 → 매출일지로 전환", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByText("이번달 순이익"));
  expect(await screen.findByText(/매출일지/)).toBeInTheDocument();
  expect(screen.queryByText("이번달 순이익")).not.toBeInTheDocument();
});

test("외상 클릭 → 매출일지 + 외상 필터", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByText("⏳ 외상"));
  expect(await screen.findByText("외상업체")).toBeInTheDocument();
  expect(screen.queryByText("현금업체")).not.toBeInTheDocument();
});
