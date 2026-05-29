import { signIn } from "@/auth";
import { MARKETING_PRIMARY_BUTTON_CLASS } from "@/lib/marketing-button-classes";

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
      <button type="submit" className={MARKETING_PRIMARY_BUTTON_CLASS}>
        {label}
      </button>
    </form>
  );
}
