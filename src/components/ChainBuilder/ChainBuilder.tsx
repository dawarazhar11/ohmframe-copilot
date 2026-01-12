// Chain Builder - Interactive tolerance chain definition UI

import { useState } from 'react';
import type { ToleranceChain, ChainLink, LinkType } from '../../lib/tolerance/types';
import { createNewLink } from '../../lib/tolerance/types';

interface ChainBuilderProps {
  chain: ToleranceChain | null;
  onCreateChain: (name: string) => void;
  onAddLink: (link: ChainLink) => void;
  onUpdateLink: (linkId: string, updates: Partial<ChainLink>) => void;
  onRemoveLink: (linkId: string) => void;
  onCalculate: () => void;
  isCalculating: boolean;
}

export function ChainBuilder({
  chain,
  onCreateChain,
  onAddLink,
  onUpdateLink,
  onRemoveLink,
  onCalculate,
  isCalculating,
}: ChainBuilderProps) {
  const [newChainName, setNewChainName] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkType, setNewLinkType] = useState<LinkType>('part_dimension');
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkNominal, setNewLinkNominal] = useState(10);
  const [newLinkPlusTol, setNewLinkPlusTol] = useState(0.1);
  const [newLinkMinusTol, setNewLinkMinusTol] = useState(0.1);

  const handleCreateChain = () => {
    if (newChainName.trim()) {
      onCreateChain(newChainName.trim());
      setNewChainName('');
    }
  };

  const handleAddLink = () => {
    const link = createNewLink(
      `link-${Date.now()}`,
      newLinkType,
      newLinkName || `${newLinkType === 'part_dimension' ? 'Dimension' : 'Gap'} ${(chain?.links.length || 0) + 1}`,
      newLinkNominal
    );
    link.plusTolerance = newLinkPlusTol;
    link.minusTolerance = newLinkMinusTol;

    onAddLink(link);
    setShowAddLink(false);
    setNewLinkName('');
    setNewLinkNominal(10);
    setNewLinkPlusTol(0.1);
    setNewLinkMinusTol(0.1);
  };

  const toggleDirection = (linkId: string, currentDir: string) => {
    onUpdateLink(linkId, {
      direction: currentDir === 'positive' ? 'negative' : 'positive',
    });
  };

  if (!chain) {
    return (
      <div className="chain-builder">
        <div className="chain-builder-header">
          <span className="chain-builder-title">Tolerance Chain</span>
        </div>
        <div className="chain-create-form">
          <input
            type="text"
            placeholder="Chain name (e.g., Shaft Clearance)"
            value={newChainName}
            onChange={(e) => setNewChainName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateChain()}
            className="chain-name-input"
          />
          <button
            className="new-chain-btn"
            onClick={handleCreateChain}
            disabled={!newChainName.trim()}
          >
            + New Chain
          </button>
        </div>
        <div className="chain-build-instructions">
          <div className="chain-build-step">Create a tolerance chain to begin</div>
          <div className="chain-build-hint">
            Add dimensions and gaps to calculate stackup
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chain-builder">
      <div className="chain-builder-header">
        <span className="chain-builder-title">{chain.name}</span>
        <span className="dimension-count">{chain.links.length} links</span>
      </div>

      {/* Chain Links */}
      <div className="chain-steps">
        {chain.links.map((link, index) => (
          <div key={link.id} className="chain-step">
            <span className="chain-step-number">{index + 1}</span>
            <div className="chain-step-content">
              <span className="chain-step-type">
                {link.type === 'part_dimension' ? 'Dimension' : 'Interface Gap'}
              </span>
              <input
                type="text"
                className="chain-step-name-input"
                value={link.name}
                onChange={(e) => onUpdateLink(link.id, { name: e.target.value })}
              />
              <div className="chain-step-values">
                <input
                  type="number"
                  className="chain-step-nominal"
                  value={link.nominal}
                  onChange={(e) =>
                    onUpdateLink(link.id, { nominal: parseFloat(e.target.value) || 0 })
                  }
                  step="0.1"
                />
                <span className="chain-step-pm">±</span>
                <input
                  type="number"
                  className="chain-step-tol"
                  value={link.plusTolerance}
                  onChange={(e) =>
                    onUpdateLink(link.id, {
                      plusTolerance: parseFloat(e.target.value) || 0,
                      minusTolerance: parseFloat(e.target.value) || 0,
                    })
                  }
                  step="0.01"
                />
              </div>
            </div>
            <button
              className={`direction-btn ${link.direction}`}
              onClick={() => toggleDirection(link.id, link.direction)}
              title={`Direction: ${link.direction}`}
            >
              {link.direction === 'positive' ? '+' : '−'}
            </button>
            <button
              className="chain-step-remove"
              onClick={() => onRemoveLink(link.id)}
              title="Remove link"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add Link Form */}
      {showAddLink ? (
        <div className="add-link-form">
          <div className="add-link-row">
            <select
              value={newLinkType}
              onChange={(e) => setNewLinkType(e.target.value as LinkType)}
              className="add-link-type"
            >
              <option value="part_dimension">Part Dimension</option>
              <option value="interface_gap">Interface Gap</option>
            </select>
            <input
              type="text"
              placeholder="Name"
              value={newLinkName}
              onChange={(e) => setNewLinkName(e.target.value)}
              className="add-link-name"
            />
          </div>
          <div className="add-link-row">
            <input
              type="number"
              placeholder="Nominal"
              value={newLinkNominal}
              onChange={(e) => setNewLinkNominal(parseFloat(e.target.value) || 0)}
              className="add-link-nominal"
              step="0.1"
            />
            <span className="add-link-pm">±</span>
            <input
              type="number"
              placeholder="Tol"
              value={newLinkPlusTol}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setNewLinkPlusTol(val);
                setNewLinkMinusTol(val);
              }}
              className="add-link-tol"
              step="0.01"
            />
          </div>
          <div className="add-link-actions">
            <button onClick={() => setShowAddLink(false)} className="add-link-cancel">
              Cancel
            </button>
            <button onClick={handleAddLink} className="add-link-confirm">
              Add Link
            </button>
          </div>
        </div>
      ) : (
        <button
          className="add-dimension-btn"
          onClick={() => setShowAddLink(true)}
        >
          + Add Dimension / Gap
        </button>
      )}

      {/* Calculate Button */}
      <button
        className="calculate-btn"
        onClick={onCalculate}
        disabled={chain.links.length < 1 || isCalculating}
      >
        {isCalculating ? 'Calculating...' : 'Calculate Stackup'}
      </button>
    </div>
  );
}

export default ChainBuilder;
