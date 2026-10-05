import { useEffect, useState } from "react";

import { COARSE_POINTER_TEXT_BASE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { cn } from "@/lib/utils";

export function ImagePreview({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (failed) {
    return <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>이 이미지를 열지 못했습니다.</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      <img
        src={url}
        alt={name}
        className="max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
