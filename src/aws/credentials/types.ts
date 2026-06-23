export type CredentialRequest =
  | { strategy: "default" }
  | {
      strategy: "assume-role";
      roleArn: string;
      externalId?: string;
      sessionName?: string;
    };
