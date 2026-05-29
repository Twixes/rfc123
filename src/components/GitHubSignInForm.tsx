import { signIn } from "@/auth";
import { MarketingButton } from "@/components/MarketingButton";

export function GitHubSignInForm({
  label = "Sign in/up with GitHub",
}: {
  label?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github");
      }}
    >
      <MarketingButton type="submit" variant="primary">
        {label}
      </MarketingButton>
    </form>
  );
}
