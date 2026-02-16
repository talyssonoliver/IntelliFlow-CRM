export default function SsoCallbackPage() {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Authenticating...</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Completing SSO sign-in. You will be redirected shortly.
        </p>
      </div>
    </div>
  );
}
