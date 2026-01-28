const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

// Listar todas as marcas ativas
router.get('/', authMiddleware, async (req, res) => {
  try {
    const marcas = await prisma.marca.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });

    res.json(marcas);
  } catch (erro) {
    console.error('Erro ao listar marcas:', erro);
    res.status(500).json({ erro: 'Erro ao listar marcas' });
  }
});

// Listar todas as marcas (incluindo inativas) - admin
router.get('/todas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const marcas = await prisma.marca.findMany({
      orderBy: { nome: 'asc' },
      include: {
        _count: {
          select: { pecas: true }
        }
      }
    });

    res.json(marcas);
  } catch (erro) {
    console.error('Erro ao listar todas marcas:', erro);
    res.status(500).json({ erro: 'Erro ao listar marcas' });
  }
});

// Criar marca (admin)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { nome } = req.body;

    if (!nome) {
      return res.status(400).json({ erro: 'Nome da marca é obrigatório' });
    }

    const marca = await prisma.marca.create({
      data: { nome }
    });

    res.status(201).json(marca);
  } catch (erro) {
    console.error('Erro ao criar marca:', erro);
    if (erro.code === 'P2002') {
      return res.status(400).json({ erro: 'Marca já existe' });
    }
    res.status(500).json({ erro: 'Erro ao criar marca' });
  }
});

// Atualizar marca (admin)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, ativo } = req.body;

    const marca = await prisma.marca.update({
      where: { id: parseInt(id) },
      data: { nome, ativo }
    });

    res.json(marca);
  } catch (erro) {
    console.error('Erro ao atualizar marca:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar marca' });
  }
});

// Deletar marca (admin) - só se não tiver peças
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const pecasCount = await prisma.peca.count({
      where: { marcaId: parseInt(id) }
    });

    if (pecasCount > 0) {
      return res.status(400).json({ 
        erro: 'Não é possível deletar marca com peças cadastradas. Desative-a ao invés.' 
      });
    }

    await prisma.marca.delete({
      where: { id: parseInt(id) }
    });

    res.json({ mensagem: 'Marca deletada com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar marca:', erro);
    res.status(500).json({ erro: 'Erro ao deletar marca' });
  }
});

module.exports = router;
