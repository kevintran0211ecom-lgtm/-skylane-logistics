import { startTransition, type FormEvent } from "react";

/**
 * Gửi form tới action của useActionState mà KHÔNG để React 19 tự reset form
 * (React reset form khi dùng prop `action`, làm mất dữ liệu đã nhập khi có lỗi
 * và xóa file đã chọn sau bước "Xem trước").
 * `dispatch` có thể là 1 action, hoặc chọn theo nút bấm (name/value của submitter).
 */
export function submitWithoutReset(dispatch: (fd: FormData, submitter: HTMLElement | null) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter ?? null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd, submitter));
  };
}
