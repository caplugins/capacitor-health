export interface CapacitorHealthPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
}
