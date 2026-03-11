import axios from "axios";
import type {
  User,
  Instrument,
  Camera,
  Experiment,
  Measurement,
  InstrumentSettings,
} from "./types";

function getBaseURL(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env && !env.includes("localhost")) return env;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  return env || "http://localhost:8080";
}

const API = axios.create({
  baseURL: getBaseURL(),
});

API.interceptors.request.use((cfg) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token && cfg.headers) {
      cfg.headers.Authorization = `Bearer ${token}`;
    }
  }
  return cfg;
});

API.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

// --- Auth ---
export const login = (loginStr: string, password: string) =>
  API.post<{ token: string; user: User }>("/auth/login", {
    login: loginStr,
    password,
  });

export const getMe = () => API.get<User>("/auth/me");

export const changePassword = (old_password: string, new_password: string) =>
  API.put("/auth/password", { old_password, new_password });

// --- Users ---
export const listUsers = () => API.get<User[]>("/users");

export const createUser = (data: {
  first_name: string;
  last_name: string;
  position: string;
  login: string;
  password: string;
  permission: string;
  instrument_access: boolean;
}) => API.post("/users", data);

export const updateUser = (
  id: number,
  data: Record<string, unknown>
) => API.put(`/users/${id}`, data);

export const deleteUser = (id: number) => API.delete(`/users/${id}`);

// --- Instruments ---
export const listInstruments = () => API.get<Instrument[]>("/instruments");

export const toggleInstrument = (id: number) =>
  API.put<Instrument>(`/instruments/${id}/toggle`);

export const pingInstrument = (id: number) =>
  API.get<{ idn: string; model: string; firmware: string; serial: string }>(`/instruments/${id}/ping`);

export const getInstrumentSettings = (id: number) =>
  API.get<InstrumentSettings>(`/instruments/${id}/settings`);

export const sendInstrumentCommand = (id: number, command: string) =>
  API.post<{ response: string }>(`/instruments/${id}/command`, { command });

export const applyInstrumentSettings = (id: number, settings: InstrumentSettings) =>
  API.post<{ ok: boolean }>(`/instruments/${id}/settings`, settings);

// --- Cameras ---
export const listCameras = () => API.get<Camera[]>("/cameras");
export const toggleCamera = (id: number) => API.put<Camera>(`/cameras/${id}/toggle`);

// --- Experiments ---
export const listExperiments = () => API.get<Experiment[]>("/experiments");

export const getExperiment = (id: number) =>
  API.get<Experiment>(`/experiments/${id}`);

export const getExperimentData = (
  id: number,
  params?: { from?: string; to?: string; step?: number; page?: number; per_page?: number }
) =>
  API.get<{
    experiment: Experiment;
    measurements: Measurement[];
    total: number;
    filtered_total: number;
    page: number;
    per_page: number;
    time_min: string | null;
    time_max: string | null;
  }>(`/experiments/${id}/data`, { params });

export const getExperimentStatus = (id: number) =>
  API.get<{
    experiment: Experiment;
    polling_active: boolean;
    measurement_count: number;
  }>(`/experiments/${id}/status`);

export const startExperiment = (data: {
  name: string;
  instrument_ids: string;
  notes: string;
  settings?: Record<string, InstrumentSettings>;
  duration_sec?: number;
  hv_schedule?: Record<string, { time_sec: number; voltage: number }[]>;
}) => API.post<{ experiment: Experiment }>("/experiments/start", data);

export const stopExperiment = (id: number) =>
  API.post<{ experiment: Experiment }>(`/experiments/${id}/stop`);

export const deleteExperiment = (id: number) =>
  API.delete(`/experiments/${id}`);

export const getExperimentVideoUrl = (id: number): string => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return `${getBaseURL()}/experiments/${id}/video?token=${token}`;
};

export default API;
