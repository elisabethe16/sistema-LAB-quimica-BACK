const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());

// O CORS configurado assim permite que o seu site na Vercel envie dados sem bloqueios
app.use(cors());

// Conexão com o Supabase usando as variáveis de ambiente que configurou no Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Função utilitária para gravar ações no Histórico Geral automaticamente
async function registrarNoHistorico(acao, detalhes, usuario_responsavel) {
    try {
        await supabase
            .from('historico')
            .insert([{ acao, detalhes, usuario_responsavel }]);
    } catch (err) {
        console.error('Erro ao gravar histórico:', err);
    }
}

// ==================== 1. ROTA DE AUTENTICAÇÃO (LOGIN) ====================
app.post('/login', async (req, res) => {
    const { login, senha } = req.body;

    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('login', login)
        .eq('senha', senha)
        .maybeSingle();

    if (error || !data) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Grava no histórico que este utilizador entrou no sistema
    await registrarNoHistorico('Login efetuado', `O utilizador ${data.nome} acedeu à plataforma.`, data.nome);

    res.status(200).json({ id: data.id, nome: data.nome, cargo: data.cargo });
});

// ==================== 2. ROTA DE REGISTAR SAÍDA DE INSUMO ====================
app.post('/registrar-saida', async (req, res) => {
    const { usuario, insumo, finalidade, quantidade, usuario_responsavel } = req.body;

    const { data, error } = await supabase
        .from('movimentacoes')
        .insert([{ usuario, insumo, finalidade, quantidade }]);

    if (error) return res.status(400).json({ error: error.message });

    // Grava a saída no histórico geral
    await registrarNoHistorico(
        'Saída de Insumo',
        `Saída de ${quantidade} un. de [${insumo}] para o utilizador/aluno: ${usuario}. Finalidade: ${finalidade}`,
        usuario_responsavel
    );

    res.status(200).json({ message: 'Saída registada com sucesso!', data });
});

// ==================== 3. ROTA DE CADASTRAR NOVO INSUMO ====================
app.post('/insumos', async (req, res) => {
    const { nome, categoria, quantidade_estoque, usuario_responsavel } = req.body;

    const { data, error } = await supabase
        .from('insumos_cadastrados')
        .insert([{ nome, categoria, quantidade_estoque }]);

    if (error) return res.status(400).json({ error: error.message });

    // Grava o cadastro do insumo no histórico geral
    await registrarNoHistorico(
        'Cadastro de Insumo',
        `Insumo [${nome}] adicionado à categoria [${categoria}] com estoque inicial de ${quantidade_estoque} un.`,
        usuario_responsavel
    );

    res.status(200).json({ message: 'Insumo cadastrado com sucesso!', data });
});

// ==================== 4. ROTA DE CADASTRAR NOVO USUÁRIO ====================
app.post('/usuarios', async (req, res) => {
    const { nome, login, senha, cargo, usuario_responsavel } = req.body;

    const { data, error } = await supabase
        .from('usuarios')
        .insert([{ nome, login, senha, cargo }]);

    if (error) return res.status(400).json({ error: 'Erro ao cadastrar. O login escolhido já pode estar em uso.' });

    // Grava o cadastro do utilizador no histórico geral
    await registrarNoHistorico(
        'Cadastro de Usuário',
        `Novo utilizador cadastrado: ${nome} com cargo de [${cargo}].`,
        usuario_responsavel
    );

    res.status(200).json({ message: 'Usuário cadastrado com sucesso!', data });
});

// ==================== 5. ROTA DE CONSULTAR ACERVO (LISTAR INSUMOS) ====================
app.get('/insumos', async (req, res) => {
    const { data, error } = await supabase
        .from('insumos_cadastrados')
        .select('*')
        .order('nome', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

// ==================== 6. ROTA DE CONSULTAR HISTÓRICO GERAL ====================
app.get('/historico', async (req, res) => {
    const { data, error } = await supabase
        .from('historico')
        .select('*')
        .order('data_registro', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json(data);
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ativo na porta ${PORT}`);
});
