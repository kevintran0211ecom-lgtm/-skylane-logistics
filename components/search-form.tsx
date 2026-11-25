import { Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/** Ô tìm kiếm dạng GET (không cần JS); gửi lại sẽ về trang 1 */
export function SearchForm({ q, placeholder }: { q?: string; placeholder: string }) {
  return (
    <form className="mb-4 flex max-w-md gap-2" role="search">
      <Input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" variant="outline">
        <Search /> Tìm
      </Button>
    </form>
  );
}
