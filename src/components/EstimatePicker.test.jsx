import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EstimatePicker from "./EstimatePicker";

test("세부견적서/간이영수증 권한이 모두 있으면, 세 카드 모두 클릭 시 해당 값으로 onSelect가 호출된다", async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  render(<EstimatePicker onSelect={onSelect} canUseDetailed={true} canUseReceipt={true} />);

  expect(screen.getByText("간이견적서")).toBeInTheDocument();
  expect(screen.getByText("세부견적서")).toBeInTheDocument();
  expect(screen.getByText("간이영수증")).toBeInTheDocument();

  await user.click(screen.getByText("간이견적서"));
  expect(onSelect).toHaveBeenCalledWith("simple");

  await user.click(screen.getByText("세부견적서"));
  expect(onSelect).toHaveBeenCalledWith("detailed");

  await user.click(screen.getByText("간이영수증"));
  expect(onSelect).toHaveBeenCalledWith("receipt");
});

test("세부견적서 권한이 없으면 잠금 표시가 뜨고, 클릭해도 onSelect가 호출되지 않는다", async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  render(<EstimatePicker onSelect={onSelect} canUseDetailed={false} canUseReceipt={true} />);

  // 간이견적서는 여전히 정상 동작
  await user.click(screen.getByText("간이견적서"));
  expect(onSelect).toHaveBeenCalledWith("simple");

  // 세부견적서는 잠금 안내가 보이고 클릭해도 반응 없음
  expect(screen.getByText("관리자가 사용 권한을 허용해야 이용할 수 있습니다")).toBeInTheDocument();

  await user.click(screen.getByText("세부견적서"));
  expect(onSelect).not.toHaveBeenCalledWith("detailed");
});

test("간이영수증 권한이 없으면 잠금 표시가 뜨고, 클릭해도 onSelect가 호출되지 않는다", async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  render(<EstimatePicker onSelect={onSelect} canUseDetailed={true} canUseReceipt={false} />);

  await user.click(screen.getByText("간이영수증"));
  expect(onSelect).not.toHaveBeenCalledWith("receipt");

  // 세부견적서는 권한이 있으니 정상 동작
  await user.click(screen.getByText("세부견적서"));
  expect(onSelect).toHaveBeenCalledWith("detailed");
});

test("두 권한 모두 없으면 간이견적서만 정상 동작하고 나머지 둘은 모두 막힌다", async () => {
  const onSelect = jest.fn();
  const user = userEvent.setup();
  render(<EstimatePicker onSelect={onSelect} canUseDetailed={false} canUseReceipt={false} />);

  await user.click(screen.getByText("간이견적서"));
  expect(onSelect).toHaveBeenCalledWith("simple");

  await user.click(screen.getByText("세부견적서"));
  await user.click(screen.getByText("간이영수증"));
  expect(onSelect).not.toHaveBeenCalledWith("detailed");
  expect(onSelect).not.toHaveBeenCalledWith("receipt");
  expect(onSelect).toHaveBeenCalledTimes(1); // 간이견적서 클릭 1번만
});
