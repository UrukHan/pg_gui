'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { Schema } from '@/components/types';

const API_ROOT = process.env.NEXT_PUBLIC_API_URL!;
const SCHEMA_URL = `${API_ROOT}/schema`;

interface SchemaContextType {
    schema: Schema;
    reloadSchema: () => Promise<void>;
}

const SchemaContext = createContext<SchemaContextType | undefined>(undefined);

export function useSchema() {
    const context = useContext(SchemaContext);
    if (!context) {
        throw new Error('useSchema должен использоваться внутри SchemaProvider');
    }
    return context;
}

export function SchemaProvider({ children }: { children: React.ReactNode }) {
    const [schema, setSchema] = useState<Schema>({ tables: [] });

    const reloadSchema = async () => {
        try {
            const res = await axios.get(SCHEMA_URL);
            setSchema(res.data);
            console.log("Schema обновлена глобально", res.data);
        } catch (error) {
            console.error("Ошибка загрузки схемы:", error);
        }
    };

    useEffect(() => {
        reloadSchema();
    }, []);

    return (
        <SchemaContext.Provider value={{ schema, reloadSchema }}>
            {children}
        </SchemaContext.Provider>
    );
}
