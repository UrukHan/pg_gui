'use client';

import { useState, useEffect } from 'react';
import { Table, Field } from './types';
import { Box, TextField, Button, Select, MenuItem, Checkbox, Typography, Tooltip } from '@mui/material';
import axios from 'axios';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;
const SCHEMA_URL = `${API_ROOT}/schema`;

const types = ['uint', 'int', 'float', 'string', 'bool', 'text', 'text_array'];
const onDeleteOptions = ['RESTRICT', 'CASCADE', 'SET NULL'];

const ASSET_FIELDS = new Set(['image_links', 'file_links']);
const notAsset = (name: string) => !ASSET_FIELDS.has(name);

interface Props {
    table: Table;
    onSave: (table: Table, renameFrom?: string) => void;
    onCancel: () => void;
}

export default function TableEditor({ table, onSave, onCancel }: Props) {
    const [currentTable, setCurrentTable] = useState<Table>(table);
    const [existingTables, setExistingTables] = useState<Table[]>([]);
    const initialTableName = table.name;

    useEffect(() => {
        axios.get(SCHEMA_URL).then(res => setExistingTables(res.data.tables));
    }, []);

    const handleFieldChange = (index: number, field: Partial<Field>) => {
        const fields = [...currentTable.fields];
        fields[index] = { ...fields[index], ...field };
        setCurrentTable({ ...currentTable, fields });
    };

    const addField = () => {
        setCurrentTable({
            ...currentTable,
            fields: [
                ...currentTable.fields,
                { name: '', type: 'string', nullable: false, unique: false, default: '' }
            ],
        });
    };

    const handleSave = () => {
        onSave(currentTable, initialTableName !== currentTable.name ? initialTableName : undefined);
    };

    const getFieldsForForeignTable = (tableName: string) => {
        const foreignTable = existingTables.find(t => t.name === tableName);
        const fields = foreignTable ? foreignTable.fields || [] : [];
        const hasId = fields.some(f => f.name === 'id');
        const base = hasId ? fields : [{ name: 'id', type: 'uint' } as Field, ...fields];
        return base.filter(f => notAsset(f.name));
    };

    return (
        <Box sx={{ mt: 2 }}>
            <Tooltip placement="top" title="Название таблицы в базе данных (например, Users, Orders)">
                <TextField
                    label="Table Name"
                    value={currentTable.name}
                    onChange={e => setCurrentTable({ ...currentTable, name: e.target.value })}
                    fullWidth
                    sx={{ mb: 2 }}
                />
            </Tooltip>

            {currentTable.fields
                .filter(field => field.name !== 'id' && notAsset(field.name))
                .map((field, idx) => (
                    <Box key={idx} sx={{ border: '1px solid #ddd', borderRadius: 1, p: 1, mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '1%' }}>
                            <Box sx={{ width: '16%' }}>
                                <TextField
                                    label="Name"
                                    value={field.name}
                                    onChange={e => handleFieldChange(idx, { name: e.target.value })}
                                    size="small"
                                    fullWidth
                                />
                            </Box>

                            <Box sx={{ width: '11%' }}>
                                <Select
                                    value={field.type}
                                    onChange={e => handleFieldChange(idx, { type: e.target.value })}
                                    size="small"
                                    fullWidth
                                >
                                    {types.map(t => (
                                        <MenuItem key={t} value={t}>
                                            {t}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <Box sx={{ width: '14%' }}>
                                <TextField
                                    label="Default"
                                    value={field.default || ''}
                                    onChange={e => handleFieldChange(idx, { default: e.target.value })}
                                    size="small"
                                    disabled={field.nullable}
                                    fullWidth
                                />
                            </Box>

                            <Box sx={{ width: '14%' }}>
                                <Typography variant="caption" align="center">
                                    FK Table
                                </Typography>
                                <Select
                                    value={field.foreignKey?.table || ''}
                                    displayEmpty
                                    size="small"
                                    onChange={e =>
                                        handleFieldChange(idx, {
                                            foreignKey: { table: e.target.value, field: '', onDelete: 'RESTRICT' },
                                        })
                                    }
                                    fullWidth
                                >
                                    <MenuItem value="">None</MenuItem>
                                    {existingTables.map(t => (
                                        <MenuItem key={t.name} value={t.name}>
                                            {t.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <Box sx={{ width: '10%' }}>
                                <Typography variant="caption" align="center">
                                    FK Field
                                </Typography>
                                <Select
                                    value={field.foreignKey?.field || ''}
                                    displayEmpty
                                    size="small"
                                    disabled={!field.foreignKey?.table}
                                    onChange={e =>
                                        handleFieldChange(idx, {
                                            foreignKey: { ...(field.foreignKey as any), field: e.target.value },
                                        })
                                    }
                                    fullWidth
                                >
                                    <MenuItem value="">None</MenuItem>
                                    {getFieldsForForeignTable(field.foreignKey?.table || '').map(f => (
                                        <MenuItem key={f.name} value={f.name}>
                                            {f.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <Box sx={{ width: '16%' }}>
                                <Typography variant="caption" align="center">
                                    ON DELETE
                                </Typography>
                                <Select
                                    value={field.foreignKey?.onDelete || 'RESTRICT'}
                                    size="small"
                                    disabled={!field.foreignKey?.table}
                                    onChange={e =>
                                        handleFieldChange(idx, {
                                            foreignKey: { ...(field.foreignKey as any), onDelete: e.target.value as any },
                                        })
                                    }
                                    fullWidth
                                >
                                    {onDeleteOptions.map(opt => (
                                        <MenuItem key={opt} value={opt}>
                                            {opt}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <Box sx={{ width: '11%', textAlign: 'center' }}>
                                <Button
                                    color="error"
                                    onClick={() =>
                                        setCurrentTable({
                                            ...currentTable,
                                            fields: currentTable.fields.filter((_, i) => i !== idx),
                                        })
                                    }
                                >
                                    Remove
                                </Button>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                            {['Optional', 'Unique'].map((label, i) => (
                                <Box key={label} sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="caption">{label}</Typography>
                                    <Checkbox
                                        checked={(i === 0 ? field.nullable : field.unique) || false}
                                        onChange={(_, v) => handleFieldChange(idx, i === 0 ? { nullable: v } : { unique: v })}
                                        size="small"
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                ))}

            <Button variant="outlined" onClick={addField}>
                Add Field
            </Button>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button variant="contained" sx={{ bgcolor: 'purple', color: 'white' }} onClick={onCancel}>
                    Cancel
                </Button>
                <Button variant="contained" color="primary" onClick={handleSave}>
                    Save Table
                </Button>
            </Box>
        </Box>
    );
}
