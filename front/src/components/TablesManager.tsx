// src/components/TablesManager.tsx
'use client';

import { Box } from '@mui/material';
import TableColumn from './TableColumn';
import { Schema } from './types';

interface TablesManagerProps {
    columns: number;
    schema: Schema;
    setMessage: React.Dispatch<React.SetStateAction<{ text: string; type: 'error' | 'success' } | null>>;
}

export default function TablesManager({ columns, schema, setMessage }: TablesManagerProps) {
    return (
        <Box sx={{ display: 'flex', width: '100%', height: '100%', gap: 1, p: 2 }}>
            {schema.tables.slice(0, columns).map((table, idx) => (
                <Box key={idx} sx={{ flexGrow: 1, display: 'flex', height: '100%', flexDirection: 'column' }}>
                    <TableColumn
                        initialTable={table}
                        setMessage={setMessage}
                    />
                </Box>
            ))}
        </Box>
    );
}
