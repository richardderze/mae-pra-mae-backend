const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const upload = require('../config/upload');

const prisma = new PrismaClient();

// Listar peças com filtros
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, parceiroId } = req.query;
    
    const where = {};
    
    // Filtro de status
    if (status) {
      where.status = status;
    }
    
    // Se for parceiro, só mostra suas peças
    if (req.usuario.tipo === 'parceiro') {
      where.parceiroId = req.usuario.parceiroId;
    } else if (parceiroId) {
      // Admin pode filtrar por parceiro
      where.parceiroId = parseInt(parceiroId);
    }

    const pecas = await prisma.peca.findMany({
      where,
      include: {
        parceiro: {
          include: {
            usuario: {
              select: {
                nome: true
              }
            }
          }
        },
        marca: true,
        tamanho: true,
        vendas: true
      },
      orderBy: {
        dataEntrada: 'desc'
      }
    });

    // Calcular margem para cada peça
    const pecasComMargem = pecas.map(peca => {
      const margemAbsoluta = peca.valorVenda - peca.valorCusto;
      const margemPercentual = peca.valorCusto > 0 
        ? ((margemAbsoluta / peca.valorCusto) * 100).toFixed(2)
        : 0;

      return {
        ...peca,
        margemAbsoluta: margemAbsoluta.toFixed(2),
        margemPercentual: parseFloat(margemPercentual)
      };
    });

    res.json(pecasComMargem);
  } catch (erro) {
    console.error('Erro ao listar peças:', erro);
    res.status(500).json({ erro: 'Erro ao listar peças' });
  }
});

// Obter uma peça específica
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const peca = await prisma.peca.findUnique({
      where: { id: parseInt(id) },
      include: {
        parceiro: {
          include: {
            usuario: {
              select: {
                nome: true,
                email: true
              }
            }
          }
        },
        marca: true,
        tamanho: true,
        vendas: {
          include: {
            pagamento: true
          }
        }
      }
    });

    if (!peca) {
      return res.status(404).json({ erro: 'Peça não encontrada' });
    }

    // Parceiros só podem ver suas próprias peças
    if (req.usuario.tipo === 'parceiro' && peca.parceiroId !== req.usuario.parceiroId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    // Calcular margem
    const margemAbsoluta = peca.valorVenda - peca.valorCusto;
    const margemPercentual = peca.valorCusto > 0 
      ? ((margemAbsoluta / peca.valorCusto) * 100).toFixed(2)
      : 0;

    res.json({
      ...peca,
      margemAbsoluta: margemAbsoluta.toFixed(2),
      margemPercentual: parseFloat(margemPercentual)
    });
  } catch (erro) {
    console.error('Erro ao obter peça:', erro);
    res.status(500).json({ erro: 'Erro ao obter peça' });
  }
});

// Criar nova peça
router.post('/', authMiddleware, upload.array('fotos', 5), async (req, res) => {
  try {
    const { 
      codigoEtiqueta, 
      valorCusto, 
      valorVenda, 
      parceiroId,
      marcaId,
      tamanhoId,
      status,
      observacoes,
      dataEntrada
    } = req.body;

    if (!codigoEtiqueta || !valorCusto || !valorVenda || !parceiroId || !marcaId || !tamanhoId) {
      return res.status(400).json({ erro: 'Dados obrigatórios faltando' });
    }

    // Processar fotos
    const fotos = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const peca = await prisma.peca.create({
      data: {
        codigoEtiqueta,
        valorCusto: parseFloat(valorCusto),
        valorVenda: parseFloat(valorVenda),
        parceiroId: parseInt(parceiroId),
        marcaId: parseInt(marcaId),
        tamanhoId: parseInt(tamanhoId),
        status: status || 'disponivel',
        observacoes,
        fotos,
        dataEntrada: dataEntrada ? new Date(dataEntrada) : new Date()
      },
      include: {
        parceiro: {
          include: {
            usuario: {
              select: { nome: true }
            }
          }
        },
        marca: true,
        tamanho: true
      }
    });

    res.status(201).json(peca);
  } catch (erro) {
    console.error('Erro ao criar peça:', erro);
    if (erro.code === 'P2002') {
      return res.status(400).json({ erro: 'Código de etiqueta já existe' });
    }
    res.status(500).json({ erro: 'Erro ao criar peça' });
  }
});

// Atualizar peça
router.put('/:id', authMiddleware, upload.array('novasFotos', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      codigoEtiqueta, 
      valorCusto, 
      valorVenda, 
      parceiroId,
      marcaId,
      tamanhoId,
      status,
      observacoes,
      fotosExistentes
    } = req.body;

    // Verificar se a peça existe
    const pecaExistente = await prisma.peca.findUnique({
      where: { id: parseInt(id) }
    });

    if (!pecaExistente) {
      return res.status(404).json({ erro: 'Peça não encontrada' });
    }

    // Processar fotos
    let fotos = fotosExistentes ? JSON.parse(fotosExistentes) : [];
    if (req.files && req.files.length > 0) {
      const novasFotos = req.files.map(file => `/uploads/${file.filename}`);
      fotos = [...fotos, ...novasFotos];
    }

    const peca = await prisma.peca.update({
      where: { id: parseInt(id) },
      data: {
        codigoEtiqueta,
        valorCusto: valorCusto ? parseFloat(valorCusto) : undefined,
        valorVenda: valorVenda ? parseFloat(valorVenda) : undefined,
        parceiroId: parceiroId ? parseInt(parceiroId) : undefined,
        marcaId: marcaId ? parseInt(marcaId) : undefined,
        tamanhoId: tamanhoId ? parseInt(tamanhoId) : undefined,
        status,
        observacoes,
        fotos
      },
      include: {
        parceiro: {
          include: {
            usuario: {
              select: { nome: true }
            }
          }
        },
        marca: true,
        tamanho: true
      }
    });

    res.json(peca);
  } catch (erro) {
    console.error('Erro ao atualizar peça:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar peça' });
  }
});

// Deletar peça
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se tem vendas
    const vendasCount = await prisma.venda.count({
      where: { pecaId: parseInt(id) }
    });

    if (vendasCount > 0) {
      return res.status(400).json({ 
        erro: 'Não é possível deletar peça que já foi vendida' 
      });
    }

    await prisma.peca.delete({
      where: { id: parseInt(id) }
    });

    res.json({ mensagem: 'Peça deletada com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar peça:', erro);
    res.status(500).json({ erro: 'Erro ao deletar peça' });
  }
});

module.exports = router;
