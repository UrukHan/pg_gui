'use client';

import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import axios from 'axios';
import { Field } from './types';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;
const SCHEMA_URL = `${API_ROOT}/schema`;

const ASSET_FIELDS = new Set(['image_links', 'file_links']);
const notAsset = (name: string) => !ASSET_FIELDS.has(name);

interface Props {
    open: boolean;
    fields: Field[];
    onClose: () => void;
    onSave: (data: Record<string, any>) => void;
}

type FKOption = { id: any; label: string };

export default function AddRowDialog({ open, fields, onClose, onSave }: Props) {
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [fkOptions, setFkOptions] = useState<Record<string, FKOption[]>>({});

    const showId =
        fields.some(f => f.name === 'id' && f.type !== 'int' && f.type !== 'uint');

    useEffect(() => {
        const initial = fields.reduce((acc, f) => {
            if ((f.name === 'id' && !showId) || ASSET_FIELDS.has(f.name)) return acc;
            acc[f.name] = '';
            return acc;
        }, {} as Record<string, any>);

        // подгружаем FK варианты
        (async () => {
            const map: Record<string, FKOption[]> = {};
            for (const f of fields) {
                // поле-внешний ключ?
                const fk = (f as any).foreignKey as
                    | { table: string; field: string }
                    | undefined;
                if (fk?.table && fk.field) {
                    try {
                        const res = await axios.get(`${SCHEMA_URL}/${fk.table}`);
                        const rows: any[] = res.data?.rows ?? [];
                        // делаем красивую подпись: пытаемся найти 'name'/'title'/'mail', иначе id
                        const labelKey =
                            ['name', 'title', 'mail', 'email'].find(k => rows[0]?.[k] !== undefined) ?? fk.field;
                        map[f.name] = rows.map(r => ({
                            id: r[fk.field],
                            label: `${r[labelKey]} (id=${r[fk.field]})`,
                        }));
                    } catch {
                        map[f.name] = [];
                    }
                }
            }
            setFkOptions(map);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fields, showId]);

    const handleChange = (name: string, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveClick = () => onSave(formData);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Add Row</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fields
                    .filter(f => (f.name !== 'id' || showId) && notAsset(f.name))
                    .map(f => {
                    // скрываем id если он авто (int/uint)
                    if (f.name === 'id' && !showId) return null;

                    const fk = (f as any).foreignKey as
                        | { table: string; field: string }
                        | undefined;

                    // Если это FK поле — рендерим селект
                    if (fk?.table && fk.field) {
                        const options = fkOptions[f.name] ?? [];
                        return (
                            <FormControl key={f.name} fullWidth size="small" sx={{ mt: 2 }}>
                                <InputLabel>{f.name}</InputLabel>
                                <Select
                                    label={f.name}
                                    value={formData[f.name] ?? ''}
                                    onChange={e => handleChange(f.name, e.target.value)}
                                >
                                    {options.map(opt => (
                                        <MenuItem key={String(opt.id)} value={opt.id}>
                                            {opt.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        );
                    }

                    // иначе — обычный TextField
                    return (
                        <TextField
                            key={f.name}
                            sx={{ mt: 2 }}
                            label={f.name}
                            value={formData[f.name] ?? ''}
                            onChange={e => handleChange(f.name, e.target.value)}
                            size="small"
                        />
                    );
                })}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={handleSaveClick}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
