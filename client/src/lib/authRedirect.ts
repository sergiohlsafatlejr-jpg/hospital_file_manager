import { TRPCClientError } from "@trpc/client";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { startLogin } from "@/const";

export const redirectToLoginIfUnauthorized = (error: unknown): boolean => {
  if (
    !(error instanceof TRPCClientError) ||
    error.message !== UNAUTHED_ERR_MSG
  ) {
    return false;
  }
  return startLogin();
};
