// @ts-nocheck
import { useCallback } from "react";
export function useCombinedRefs(...refs) {
    return useCallback((handle) => {
        for (const ref of refs) {
            if (typeof ref === "function") {
                ref(handle);
            }
            else if (ref !== null) {
                ref.current = handle;
            }
        }
    }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs);
}
//# sourceMappingURL=useCombinedRefs.js.map