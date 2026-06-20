interface ImportMeta {
  glob: (
    pattern: string,
    options?: {
      query?: string;
      import?: string;
      eager?: boolean;
    },
  ) => Record<string, unknown>;
}
