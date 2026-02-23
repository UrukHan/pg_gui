export type UserRole = "admin" | "user";
export type UserPermission = "read_own" | "read_all" | "read_write_all";
export type ExperimentStatus = "running" | "stopped" | "completed" | "error";

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  login: string;
  role: UserRole;
  permission: UserPermission;
  instrument_access: boolean;
}

export interface Instrument {
  id: number;
  name: string;
  host: string;
  port: number;
  active: boolean;
  model: string;
  firmware: string;
  serial: string;
  online: boolean;
}

export interface Experiment {
  id: number;
  name: string;
  user_id: number;
  user?: User;
  status: ExperimentStatus;
  start_time: string | null;
  end_time: string | null;
  instrument_ids: string;
  notes: string;
  created_at: string;
}

export interface Measurement {
  id: number;
  experiment_id: number;
  instrument_id: number;
  device_time: string;
  recorded_at: string;
  voltage: number;
  current: number;
  charge: number;
  resistance: number;
  temperature: number;
  humidity: number;
  source: number;
  math_value: number;
  error_code: number;
}
