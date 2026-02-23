'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControlLabel,
  Switch, Alert, CircularProgress, Chip, InputLabel, FormControl,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAuth } from '@/context/AuthContext';
import {
  listUsers, createUser, updateUser, deleteUser,
  listExperiments, deleteExperiment,
} from '@/api';
import type { User, Experiment, UserPermission } from '@/types';

interface Props {
  onOpenGraphs: (experimentId: number) => void;
}

export default function TablesTab({ onOpenGraphs }: Props) {
  const [subTab, setSubTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={subTab}
        onChange={(_, v) => setSubTab(v)}
        sx={{ mb: 2, borderBottom: '1px solid #e0e0e0' }}
      >
        <Tab label="Эксперименты" />
        <Tab label="Пользователи" />
      </Tabs>
      {subTab === 0 && <ExperimentsSubTab onOpenGraphs={onOpenGraphs} />}
      {subTab === 1 && <UsersSubTab />}
    </Box>
  );
}

// ==================== EXPERIMENTS ====================

function ExperimentsSubTab({ onOpenGraphs }: { onOpenGraphs: (id: number) => void }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const canDelete = isAdmin || currentUser?.permission === 'read_write_all';

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await listExperiments();
      setExperiments(res.data);
    } catch {
      setError('Ошибка загрузки экспериментов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить эксперимент и все его данные?')) return;
    try {
      await deleteExperiment(id);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'running': return 'success';
      case 'completed': return 'info';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'running': return 'Запущен';
      case 'completed': return 'Завершён';
      case 'stopped': return 'Остановлен';
      case 'error': return 'Ошибка';
      default: return s;
    }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('ru-RU'); } catch { return s; }
  };

  if (loading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Автор</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Начало</TableCell>
              <TableCell>Конец</TableCell>
              <TableCell>Приборы</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {experiments.map((exp) => (
              <TableRow key={exp.id}>
                <TableCell>{exp.id}</TableCell>
                <TableCell>{exp.name}</TableCell>
                <TableCell>
                  {exp.user ? `${exp.user.first_name} ${exp.user.last_name}` : `#${exp.user_id}`}
                </TableCell>
                <TableCell>
                  <Chip label={statusLabel(exp.status)} color={statusColor(exp.status) as any} size="small" />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(exp.start_time)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(exp.end_time)}</TableCell>
                <TableCell>{exp.instrument_ids}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" title="Открыть графики" onClick={() => onOpenGraphs(exp.id)}>
                    <VisibilityIcon />
                  </IconButton>
                  {canDelete && (
                    <IconButton size="small" title="Удалить" onClick={() => handleDelete(exp.id)}>
                      <DeleteIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {experiments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">Нет экспериментов</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ==================== USERS ====================

function UsersSubTab() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', position: '', login: '', password: '',
    permission: 'read_own' as UserPermission, instrument_access: false,
  });

  const load = useCallback(async () => {
    try {
      const res = await listUsers();
      setUsers(res.data);
    } catch {
      setError('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      if (editingUser) {
        const data: Record<string, unknown> = {
          first_name: form.first_name,
          last_name: form.last_name,
          position: form.position,
          login: form.login,
          permission: form.permission,
          instrument_access: form.instrument_access,
        };
        if (form.password) data.password = form.password;
        await updateUser(editingUser.id, data);
        setSuccess('Пользователь обновлён');
      } else {
        await createUser(form);
        setSuccess('Пользователь создан');
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await deleteUser(id);
      setSuccess('Пользователь удалён');
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка удаления');
    }
  };

  const permLabel = (p: string) => {
    switch (p) {
      case 'read_own': return 'Только свои';
      case 'read_all': return 'Чтение всех';
      case 'read_write_all': return 'Полный доступ';
      default: return p;
    }
  };

  if (loading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {isAdmin && (
        <Box sx={{ mb: 2 }}>
          <Button variant="outlined" onClick={() => {
            setEditingUser(null);
            setForm({ first_name: '', last_name: '', position: '', login: '', password: '', permission: 'read_own', instrument_access: false });
            setDialogOpen(true);
          }}>
            Добавить пользователя
          </Button>
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Имя</TableCell>
              <TableCell>Фамилия</TableCell>
              <TableCell>Должность</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Доступ</TableCell>
              <TableCell>Приборы</TableCell>
              {isAdmin && <TableCell align="right">Действия</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.id}</TableCell>
                <TableCell>{u.first_name}</TableCell>
                <TableCell>{u.last_name}</TableCell>
                <TableCell>{u.position}</TableCell>
                <TableCell>
                  <Chip label={u.role === 'admin' ? 'Админ' : 'Пользователь'} color={u.role === 'admin' ? 'warning' : 'default'} size="small" />
                </TableCell>
                <TableCell>{permLabel(u.permission)}</TableCell>
                <TableCell>
                  <Chip label={u.instrument_access ? 'Да' : 'Нет'} color={u.instrument_access ? 'success' : 'default'} size="small" />
                </TableCell>
                {isAdmin && (
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => {
                      setEditingUser(u);
                      setForm({
                        first_name: u.first_name, last_name: u.last_name, position: u.position,
                        login: u.login, password: '', permission: u.permission, instrument_access: u.instrument_access,
                      });
                      setDialogOpen(true);
                    }}>
                      <EditIcon />
                    </IconButton>
                    {u.role !== 'admin' && (
                      <IconButton size="small" onClick={() => handleDelete(u.id)}>
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit user dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}</DialogTitle>
        <DialogContent>
          <TextField label="Имя" fullWidth sx={{ mt: 1, mb: 2 }} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <TextField label="Фамилия" fullWidth sx={{ mb: 2 }} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <TextField label="Должность" fullWidth sx={{ mb: 2 }} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <TextField label="Логин" fullWidth sx={{ mb: 2 }} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <TextField
            label={editingUser ? 'Новый пароль (оставьте пустым)' : 'Пароль'}
            type="password"
            fullWidth
            sx={{ mb: 2 }}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Доступ к данным</InputLabel>
            <Select
              value={form.permission}
              label="Доступ к данным"
              onChange={(e) => setForm({ ...form, permission: e.target.value as UserPermission })}
            >
              <MenuItem value="read_own">Только свои (чтение + запись)</MenuItem>
              <MenuItem value="read_all">Чтение всех, запись своих</MenuItem>
              <MenuItem value="read_write_all">Полный доступ (чтение + запись всех)</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Switch checked={form.instrument_access} onChange={(e) => setForm({ ...form, instrument_access: e.target.checked })} />}
            label="Доступ к приборам"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave}>Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
