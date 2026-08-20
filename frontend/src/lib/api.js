import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

export default api;
