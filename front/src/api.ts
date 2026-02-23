import axios from "axios";
import type {
  User,
  Instrument,
  Experiment,
  Measurement,
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

export const createInstrument = (data: {
  name: string;
  host: string;
  port: number;
  active: boolean;
}) => API.post<Instrument>("/instruments", data);

export const updateInstrument = (
  id: number,
  data: { name: string; host: string; port: number; active: boolean }
) => API.put<Instrument>(`/instruments/${id}`, data);

export const deleteInstrument = (id: number) =>
  API.delete(`/instruments/${id}`);

export const pingInstrument = (id: number) =>
  API.get<{ idn: string; model: string; firmware: string; serial: string }>(`/instruments/${id}/ping`);

// --- Experiments ---
export const listExperiments = () => API.get<Experiment[]>("/experiments");

export const getExperiment = (id: number) =>
  API.get<Experiment>(`/experiments/${id}`);

export const getExperimentData = (id: number) =>
  API.get<{ experiment: Experiment; measurements: Measurement[] }>(
    `/experiments/${id}/data`
  );

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
}) => API.post<{ experiment: Experiment }>("/experiments/start", data);

export const stopExperiment = (id: number) =>
  API.post<{ experiment: Experiment }>(`/experiments/${id}/stop`);

export const deleteExperiment = (id: number) =>
  API.delete(`/experiments/${id}`);

export default API;
