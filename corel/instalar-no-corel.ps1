# =============================================================================
# Instala uma macro C# dentro do projeto VSTA do CorelDRAW.
# =============================================================================
#
# O projeto de macros do Corel e o `VSTAGlobal.CgsAddon`, um ZIP com um projeto
# C# dentro. Instalar significa acrescentar tres coisas a ele:
#
#   1. o arquivo .cs em `content/VSTA_CS_Project/`
#   2. um `<Compile Include>` no `VSTAGlobal.csproj`
#   3. um `<msb:File Include>` no `Project`
#
# Sem os dois ultimos o arquivo entra no pacote e o VSTA o ignora - ele nao
# varre a pasta, ele le a lista.
#
# POR QUE ELE REESCREVE O ZIP INTEIRO em vez de abrir em modo Update: o
# `mimetype` tem que ser a PRIMEIRA entrada e tem que estar SEM COMPRESSAO, que
# e a convencao dos formatos ZCF/ODF. O modo Update do .NET nao garante nem a
# ordem nem o metodo, e um mimetype comprimido pode fazer o Corel recusar o
# pacote. Reescrevendo, as duas coisas ficam sob controle.
#
# Uso:
#   powershell -File instalar-no-corel.ps1 -Origem <arquivo.cs> -Addon <VSTAGlobal.CgsAddon>
#
# Devolve JSON numa linha, para quem chamou nao ter que adivinhar o que houve.

param(
    [Parameter(Mandatory = $true)][string]$Origem,
    [Parameter(Mandatory = $true)][string]$Addon,
    [switch]$Desinstalar
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Responder($ok, $mensagem, $extra) {
    $r = @{ ok = $ok; mensagem = $mensagem }
    if ($extra) { foreach ($k in $extra.Keys) { $r[$k] = $extra[$k] } }
    $r | ConvertTo-Json -Compress
    exit $(if ($ok) { 0 } else { 1 })
}

try {
    if (-not (Test-Path $Addon)) {
        Responder $false "Nao achei o projeto de macros do Corel em $Addon." $null
    }
    if (-not $Desinstalar -and -not (Test-Path $Origem)) {
        Responder $false "Nao achei o arquivo da macro em $Origem." $null
    }

    # O Corel reescreve o addon quando fecha. Instalando com ele aberto, o
    # trabalho seria desfeito sem aviso nenhum.
    #
    # A trava vale so para o addon que um Corel aberto pode estar usando, e nao
    # para qualquer arquivo: instalar numa copia, ou no perfil de outro usuario,
    # nao corre esse risco. O que distingue e o caminho estar dentro do perfil
    # do Corel desta sessao.
    $perfilDoCorel = Join-Path $env:APPDATA "Corel"
    $alvoEhDoPerfil = ([System.IO.Path]::GetFullPath($Addon)).StartsWith(
        [System.IO.Path]::GetFullPath($perfilDoCorel), [System.StringComparison]::OrdinalIgnoreCase)
    if ($alvoEhDoPerfil -and (Get-Process -Name "CorelDRW" -ErrorAction SilentlyContinue)) {
        Responder $false ("O CorelDRAW esta aberto. Feche-o antes de instalar: " +
            "ao fechar, ele reescreve o projeto de macros e desfaria a instalacao.") $null
    }

    $nomeArquivo = [System.IO.Path]::GetFileName($Origem)
    $dentro = "content/VSTA_CS_Project/$nomeArquivo"

    # ---------- le o pacote inteiro para a memoria ----------
    # Sao alguns kilobytes de texto; ler tudo evita mexer no arquivo enquanto ele
    # ainda esta sendo lido.
    $entradas = [ordered]@{}
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Addon)
    try {
        foreach ($e in $zip.Entries) {
            $ms = New-Object System.IO.MemoryStream
            $s = $e.Open()
            $s.CopyTo($ms)
            $s.Close()
            $entradas[$e.FullName] = $ms.ToArray()
        }
    } finally { $zip.Dispose() }

    if (-not $entradas.Contains("content/VSTA_CS_Project/VSTAGlobal.csproj")) {
        Responder $false "Este nao parece o projeto de macros do Corel: falta o VSTAGlobal.csproj." $null
    }

    # ---------- backup, uma vez so ----------
    # Guarda o ORIGINAL, nao o de ontem: reinstalar varias vezes nao pode ir
    # empurrando o backup bom para longe.
    $backup = "$Addon.antes-do-optimize"
    if (-not (Test-Path $backup)) { Copy-Item $Addon $backup }

    # ---------- o .cs ----------
    if ($Desinstalar) {
        $entradas.Remove($dentro)
    } else {
        $entradas[$dentro] = [System.IO.File]::ReadAllBytes($Origem)
    }

    # ---------- o .csproj (UTF-8) ----------
    $csprojChave = "content/VSTA_CS_Project/VSTAGlobal.csproj"
    $csproj = [System.Text.Encoding]::UTF8.GetString($entradas[$csprojChave])
    $linhaCompile = "`t`t<Compile Include=`"$nomeArquivo`" />"
    $csproj = $csproj -replace [regex]::Escape($linhaCompile + "`r`n"), ""
    if (-not $Desinstalar) {
        # Entra ao lado dos outros Compile, e nao num ItemGroup novo: o VSTA le
        # os dois, mas um arquivo com dois grupos de codigo confunde quem abrir.
        $alvo = "`t`t<Compile Include=`"Macro.cs`" />"
        if ($csproj -notmatch [regex]::Escape($alvo)) {
            Responder $false "O VSTAGlobal.csproj nao tem a linha do Macro.cs onde eu encaixaria a nova." $null
        }
        $csproj = $csproj -replace [regex]::Escape($alvo), ($alvo + "`r`n" + $linhaCompile)
    }
    # Sem BOM novo: o texto lido ja traz o dele, e um segundo BOM quebra o XML.
    $entradas[$csprojChave] = (New-Object System.Text.UTF8Encoding($false)).GetBytes($csproj)

    # ---------- o Project (UTF-16) ----------
    $projChave = "content/VSTA_CS_Project/Project"
    $proj = [System.Text.Encoding]::Unicode.GetString($entradas[$projChave])
    # `GetString` devolve o BOM como caractere. Tirando-o aqui, o preambulo que
    # se grava no fim nao vira um SEGUNDO BOM - o arquivo original comeca com
    # `FF FE 3C 00`, e dois BOMs deixariam `FF FE FF FE`.
    $proj = $proj.TrimStart([char]0xFEFF)
    $linhaFile = "`t`t<msb:File Include=`"$nomeArquivo`"/>"
    $proj = $proj -replace [regex]::Escape($linhaFile + "`r`n"), ""
    if (-not $Desinstalar) {
        $alvo = "`t`t<msb:File Include=`"Macro.cs`"/>"
        if ($proj -notmatch [regex]::Escape($alvo)) {
            Responder $false "O descritor Project nao tem a linha do Macro.cs onde eu encaixaria a nova." $null
        }
        $proj = $proj -replace [regex]::Escape($alvo), ($alvo + "`r`n" + $linhaFile)
    }
    $entradas[$projChave] = [System.Text.Encoding]::Unicode.GetPreamble() +
                            [System.Text.Encoding]::Unicode.GetBytes($proj)

    # ---------- reescreve o pacote ----------
    # `mimetype` primeiro e SEM COMPRESSAO: ver a nota do topo.
    #
    # POR QUE UM ESCRITOR PROPRIO em vez do ZipArchive: no .NET Framework que o
    # PowerShell 5.1 carrega, `CompressionLevel::NoCompression` ainda grava o
    # metodo Deflate (nivel 0) em vez do metodo Store - conferido contra o
    # arquivo de fabrica do Corel, onde o `mimetype` esta em Store. Como o
    # pacote inteiro tem uns poucos kilobytes, sai mais simples e mais seguro
    # gravar TUDO em Store do que tentar dobrar o ZipArchive.
    if (-not ("OptimizeZip" -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.IO;

public static class OptimizeZip
{
    static readonly uint[] Tabela = Montar();

    static uint[] Montar()
    {
        var t = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            uint c = i;
            for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
            t[i] = c;
        }
        return t;
    }

    static uint Crc(byte[] d)
    {
        uint c = 0xFFFFFFFFu;
        for (int i = 0; i < d.Length; i++) c = Tabela[(c ^ d[i]) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFFu;
    }

    // Grava um ZIP com todas as entradas em Store, na ordem recebida.
    // A data e fixa em 1980-01-01 de proposito: instalar duas vezes o mesmo
    // arquivo produz bytes iguais, entao da para comparar pacotes.
    public static void Gravar(string caminho, string[] nomes, byte[][] dados)
    {
        var offsets = new uint[nomes.Length];
        var crcs = new uint[nomes.Length];
        var nomesBytes = new byte[nomes.Length][];
        const ushort hora = 0;
        const ushort data = 0x21;

        using (var fs = new FileStream(caminho, FileMode.Create, FileAccess.Write))
        using (var w = new BinaryWriter(fs))
        {
            for (int i = 0; i < nomes.Length; i++)
            {
                nomesBytes[i] = System.Text.Encoding.UTF8.GetBytes(nomes[i]);
                crcs[i] = Crc(dados[i]);
                offsets[i] = (uint)fs.Position;
                w.Write(0x04034b50); w.Write((ushort)20); w.Write((ushort)0);
                w.Write((ushort)0); w.Write(hora); w.Write(data);
                w.Write(crcs[i]); w.Write((uint)dados[i].Length); w.Write((uint)dados[i].Length);
                w.Write((ushort)nomesBytes[i].Length); w.Write((ushort)0);
                w.Write(nomesBytes[i]); w.Write(dados[i]);
            }

            uint inicioCd = (uint)fs.Position;
            for (int i = 0; i < nomes.Length; i++)
            {
                w.Write(0x02014b50); w.Write((ushort)20); w.Write((ushort)20);
                w.Write((ushort)0); w.Write((ushort)0); w.Write(hora); w.Write(data);
                w.Write(crcs[i]); w.Write((uint)dados[i].Length); w.Write((uint)dados[i].Length);
                w.Write((ushort)nomesBytes[i].Length); w.Write((ushort)0); w.Write((ushort)0);
                w.Write((ushort)0); w.Write((ushort)0); w.Write((uint)0);
                w.Write(offsets[i]);
                w.Write(nomesBytes[i]);
            }
            uint fimCd = (uint)fs.Position;

            w.Write(0x06054b50); w.Write((ushort)0); w.Write((ushort)0);
            w.Write((ushort)nomes.Length); w.Write((ushort)nomes.Length);
            w.Write(fimCd - inicioCd); w.Write(inicioCd); w.Write((ushort)0);
        }
    }
}
'@
    }

    $temporario = "$Addon.novo"
    if (Test-Path $temporario) { Remove-Item $temporario -Force }

    $ordem = @(@("mimetype") + ($entradas.Keys | Where-Object { $_ -ne "mimetype" }) |
               Where-Object { $entradas.Contains($_) })
    # A virgula segura cada byte[] como UM item: sem ela o PowerShell derrama
    # os bytes todos num vetor so.
    $dados = @($ordem | ForEach-Object { , $entradas[$_] })
    [OptimizeZip]::Gravar($temporario, [string[]]$ordem, [byte[][]]$dados)

    Move-Item $temporario $Addon -Force

    Responder $true $(if ($Desinstalar) { "Macro removida do projeto do Corel." }
                      else { "Macro instalada no projeto do Corel." }) @{
        addon = $Addon
        backup = $backup
        arquivo = $dentro
        entradas = $entradas.Count
    }
}
catch {
    Responder $false ("Falhou: " + $_.Exception.Message) $null
}
