import React, { useState, useEffect } from 'react'
import { system } from '../api/client'

export default function SystemPage() {
  const [resources, setResources] = useState(null)
  const [tools, setTools] = useState(null)

  useEffect(() => {
    system.resources().then(r => setResources(r.data)).catch(() => {})
    system.tools().then(r => setTools(r.data)).catch(() => {})
    const interval = setInterval(() => {
      system.resources().then(r => setResources(r.data)).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const gaugeClass = (pct) => pct < 60 ? 'gauge-low' : pct < 85 ? 'gauge-mid' : 'gauge-high'

  const toolLinks = {
    fastqc: 'https://www.bioinformatics.babraham.ac.uk/projects/fastqc/',
    fastp: 'https://github.com/OpenGene/fastp',
    bwa: 'https://github.com/lh3/bwa',
    samtools: 'https://www.htslib.org/download/',
    bcftools: 'https://www.htslib.org/download/',
    gatk: 'https://github.com/broadinstitute/gatk/releases',
    multiqc: 'https://multiqc.info/',
    minimap2: 'https://github.com/lh3/minimap2',
  }

  const toolDescriptions = {
    fastqc: 'Quality control for sequencing data',
    fastp: 'Fast all-in-one FASTQ preprocessor',
    bwa: 'Burrows-Wheeler Aligner for short reads',
    samtools: 'Tools for manipulating SAM/BAM files',
    bcftools: 'Variant calling and VCF manipulation',
    gatk: 'Genome Analysis Toolkit for variant discovery',
    multiqc: 'Aggregate bioinformatics results into reports',
    minimap2: 'Long read and RNA-seq alignment',
  }

  return (
    <div>
      <div className="section-header">
        <h2>System Status</h2>
      </div>

      <div className="card">
        <div className="card-header"><h3>System Resources</h3></div>
        {resources ? (
          <div className="grid grid-3">
            <div className="stat-card">
              <div className="stat-value">{resources.cpu.percent}%</div>
              <div className="stat-label">CPU ({resources.cpu.cores} cores / {resources.cpu.threads} threads)</div>
              <div className="gauge">
                <div className={`gauge-fill ${gaugeClass(resources.cpu.percent)}`} style={{ width: `${resources.cpu.percent}%` }}></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resources.memory.available_gb} GB</div>
              <div className="stat-label">RAM Available ({resources.memory.total_gb} GB total)</div>
              <div className="gauge">
                <div className={`gauge-fill ${gaugeClass(resources.memory.percent)}`} style={{ width: `${resources.memory.percent}%` }}></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{resources.disk.free_gb} GB</div>
              <div className="stat-label">Disk Free ({resources.disk.total_gb} GB total)</div>
              <div className="gauge">
                <div className={`gauge-fill ${gaugeClass(resources.disk.percent)}`} style={{ width: `${resources.disk.percent}%` }}></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="loading-state"><div className="spinner"></div><span>Loading resources...</span></div>
        )}
      </div>

      {resources?.config && (
        <div className="card">
          <div className="card-header"><h3>Platform Configuration</h3></div>
          <table className="table">
            <tbody>
              <tr><td style={{ color: 'var(--text-muted)' }}>Max Threads per Job</td><td style={{ fontWeight: 600 }}>{resources.config.max_threads}</td></tr>
              <tr><td style={{ color: 'var(--text-muted)' }}>Max Memory per Job</td><td style={{ fontWeight: 600 }}>{resources.config.max_memory_gb} GB</td></tr>
              <tr><td style={{ color: 'var(--text-muted)' }}>Max Concurrent Jobs</td><td style={{ fontWeight: 600 }}>{resources.config.max_concurrent_jobs}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Bioinformatics Tools</h3>
          {tools && (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {Object.values(tools).filter(t => t.installed).length}/{Object.keys(tools).length} installed
            </span>
          )}
        </div>
        {tools ? (
          <div>
            {Object.entries(tools).map(([name, info]) => (
              <div key={name} className="tool-row">
                <div>
                  <span className="tool-name">{name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 12 }}>{toolDescriptions[name] || ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {info.installed ? (
                    <span className="tool-installed">{info.version}</span>
                  ) : (
                    <>
                      <span className="tool-missing">Not installed</span>
                      {toolLinks[name] && (
                        <a href={toolLinks[name]} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline" style={{ fontSize: 11 }}>
                          Install
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="loading-state"><div className="spinner"></div><span>Checking tools...</span></div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h3>Quick Install (Conda)</h3></div>
        <div className="log-viewer" style={{ fontSize: 13 }}>
{`# Install all tools with conda
conda create -n ngs-tools -c bioconda -c conda-forge \\
  samtools=1.19 bcftools=1.19 bwa=0.7.18 \\
  fastp=0.23.4 fastqc=0.12.1 multiqc=1.20 \\
  gatk4=4.5.0.0 snpeff=5.2 \\
  hisat2=2.2.1 minimap2=2.28 subread=2.0.6

conda activate ngs-tools`}
        </div>
      </div>
    </div>
  )
}
