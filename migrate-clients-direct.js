// Script para ejecutar la migración de clientes directamente
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xqhhpgxoqgvftsmftvzm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxaGhwZ3hvcWd2ZnRzbWZ0dnptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYxNzI5NTUsImV4cCI6MjA1MTc0ODk1NX0.U_4aCIWbJaBj3i1I4x-k9tAgOdoZcG8kLM8vCeVMy2c';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeClientMigration() {
    console.log('🔄 Creando función de migración...');
    
    // Primer paso: crear la función de migración
    const createFunctionSQL = `
-- Función para migrar clientes legacy
CREATE OR REPLACE FUNCTION migrate_legacy_clients()
RETURNS TEXT AS $$
DECLARE
    michinanny_company_id UUID;
    result_text TEXT := '';
    clients_migrated INTEGER := 0;
BEGIN
    -- Obtener ID de Michinanny
    SELECT id INTO michinanny_company_id FROM companies WHERE name = 'Michinanny';
    
    IF michinanny_company_id IS NULL THEN
        RAISE EXCEPTION 'Empresa Michinanny no encontrada. Ejecutar primero el script de migración de usuarios.';
    END IF;
    
    result_text := result_text || 'Empresa Michinanny encontrada: ' || michinanny_company_id::text || E'\\n';
    
    -- Limpiar clientes existentes de migración anterior
    DELETE FROM clients WHERE metadata->>'legacy_id' IS NOT NULL;
    
    -- Migrar primeros 10 clientes
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), michinanny_company_id, 'Ana Pérez García', 'ana.perez@example.com', '611223344', 
     '{"legacy_direccion_id": "6800b7d54417550a4cba4392"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bb", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "12345678A"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Luis González López', 'luis.gonzalez@example.com', '622334455',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4393"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bc", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "98765432B"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Sofía Martínez Ruiz', 'sofia.martinez@example.com', '633445566',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4394"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bd", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "45678912C"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Javier Sánchez Díaz', 'javier.sanchez@example.com', '644556677',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4395"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43be", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "32165498D"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Carmen López Fernández', 'carmen.lopez@example.com', '655667788',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4396"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bf", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "78912345E"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Mamerto Humberto', 'hola@gmail.com', '654567432',
     '{"legacy_direccion_id": "683371be48117feab207e815"}'::jsonb,
     '{"legacy_id": "683371be2e4bb9979f4c9025", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "234567353K"}'::jsonb,
     '2025-05-25 19:38:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Mikimiau Miau Miau', 'miau@gmail.com', '657876452',
     '{"legacy_direccion_id": "68338da02e4bb9979f4c9b03"}'::jsonb,
     '{"legacy_id": "68338da11985382d9f221703", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "456234562A"}'::jsonb,
     '2025-05-25 21:37:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Manolo Cabeza Bolo', 'cabezabolo@gmail.com', '654234567',
     '{"legacy_direccion_id": "68338e40fb9513a4a9116a0d"}'::jsonb,
     '{"legacy_id": "68338e4148117feab207eed1", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "676545634L"}'::jsonb,
     '2025-05-25 21:40:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'Alberto Paperto Miamerto', 'miamerto@gmail.com', '675432345',
     '{"legacy_direccion_id": "6833917efb9513a4a9116a4b"}'::jsonb,
     '{"legacy_id": "6833917f48117feab207eefb", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "657542345L"}'::jsonb,
     '2025-05-25 21:54:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_company_id, 'POR FAVOR FUNCIONA', 'porfavor@gmail.com', '675434567',
     '{"legacy_direccion_id": "6833a2f1fb9513a4a9116fd3"}'::jsonb,
     '{"legacy_id": "6833a2f248117feab207f474", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "456284920G"}'::jsonb,
     '2025-05-25 23:08:00'::timestamp, NOW());
     
    clients_migrated := 10;
    
    result_text := result_text || 'Migración completada exitosamente!' || E'\\n';
    result_text := result_text || 'Total de clientes migrados: ' || clients_migrated::text || E'\\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;`;

    try {
        console.log('📝 Ejecutando creación de función...');
        const { data: createResult, error: createError } = await supabase.rpc('', {}, {
            body: createFunctionSQL
        });

        // Como rpc no funciona para SQL directo, usemos una consulta simple
        console.log('📝 Ejecutando SQL directo...');
        const { data, error } = await supabase
            .from('companies')
            .select('id, name')
            .eq('name', 'Michinanny')
            .single();

        if (error) {
            console.error('❌ Error verificando empresa:', error);
            return;
        }

        console.log('✅ Empresa Michinanny encontrada:', data);
        
        // Ahora vamos a insertar clientes directamente
        console.log('📝 Insertando clientes de prueba...');
        
        const clientsToInsert = [
            {
                company_id: data.id,
                name: 'Ana Pérez García',
                email: 'ana.perez@example.com',
                phone: '611223344',
                address: { legacy_direccion_id: '6800b7d54417550a4cba4392' },
                metadata: {
                    legacy_id: '6800bb5a4417550a4cba43bb',
                    legacy_usuario_id: '672275dacb317c137fb1dd1f',
                    dni: '12345678A'
                }
            },
            {
                company_id: data.id,
                name: 'Luis González López',
                email: 'luis.gonzalez@example.com',
                phone: '622334455',
                address: { legacy_direccion_id: '6800b7d54417550a4cba4393' },
                metadata: {
                    legacy_id: '6800bb5a4417550a4cba43bc',
                    legacy_usuario_id: '672275dacb317c137fb1dd1f',
                    dni: '98765432B'
                }
            },
            {
                company_id: data.id,
                name: 'Mamerto Humberto',
                email: 'hola@gmail.com',
                phone: '654567432',
                address: { legacy_direccion_id: '683371be48117feab207e815' },
                metadata: {
                    legacy_id: '683371be2e4bb9979f4c9025',
                    legacy_usuario_id: '672275dacb317c137fb1dd1f',
                    dni: '234567353K'
                }
            },
            {
                company_id: data.id,
                name: 'Mikimiau Miau Miau',
                email: 'miau@gmail.com',
                phone: '657876452',
                address: { legacy_direccion_id: '68338da02e4bb9979f4c9b03' },
                metadata: {
                    legacy_id: '68338da11985382d9f221703',
                    legacy_usuario_id: '672275dacb317c137fb1dd1f',
                    dni: '456234562A'
                }
            }
        ];

        // Limpiar clientes anteriores de migración
        console.log('🧹 Limpiando clientes de migraciones anteriores...');
        const { error: deleteError } = await supabase
            .from('clients')
            .delete()
            .not('metadata->legacy_id', 'is', null);

        if (deleteError) {
            console.warn('⚠️ Advertencia limpiando datos anteriores:', deleteError);
        }

        // Insertar nuevos clientes
        const { data: insertResult, error: insertError } = await supabase
            .from('clients')
            .insert(clientsToInsert)
            .select();

        if (insertError) {
            console.error('❌ Error insertando clientes:', insertError);
            return;
        }

        console.log('✅ Clientes insertados exitosamente:', insertResult);

        // Verificar los datos
        const { data: verifyData, error: verifyError } = await supabase
            .from('clients')
            .select(`
                id,
                name,
                email,
                phone,
                companies:company_id (name)
            `)
            .not('metadata->legacy_id', 'is', null);

        if (verifyError) {
            console.error('❌ Error verificando datos:', verifyError);
        } else {
            console.log('📊 Clientes migrados verificados:', verifyData);
        }

    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

// Ejecutar la migración si este script se ejecuta directamente
if (typeof window === 'undefined') {
    executeClientMigration();
}
