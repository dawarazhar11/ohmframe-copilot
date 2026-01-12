// Assembly Explorer - BOM tree and interface browser

import type { AssemblyPart, MatingInterface } from '../../lib/assembly/types';

interface AssemblyExplorerProps {
  parts: AssemblyPart[];
  interfaces: MatingInterface[];
  junctionParts: string[];
  selectedPartId: string | null;
  selectedInterfaceId: string | null;
  onPartSelect: (partId: string | null) => void;
  onInterfaceSelect: (interfaceId: string | null) => void;
}

export function AssemblyExplorer({
  parts,
  interfaces,
  junctionParts,
  selectedPartId,
  selectedInterfaceId,
  onPartSelect,
  onInterfaceSelect,
}: AssemblyExplorerProps) {
  const getInterfaceIcon = (type: string) => {
    switch (type) {
      case 'face_to_face':
        return '▬';
      case 'pin_in_hole':
        return '◎';
      case 'shaft_in_bore':
        return '⊙';
      default:
        return '○';
    }
  };

  const getInterfaceLabel = (type: string) => {
    switch (type) {
      case 'face_to_face':
        return 'Face';
      case 'pin_in_hole':
        return 'Pin/Hole';
      case 'shaft_in_bore':
        return 'Shaft/Bore';
      default:
        return 'Contact';
    }
  };

  const getPartName = (partId: string) => {
    const part = parts.find((p) => p.id === partId);
    return part?.name || partId;
  };

  return (
    <div className="assembly-explorer">
      <div className="assembly-explorer-header">
        <span className="assembly-explorer-title">Assembly BOM</span>
        <span className="part-count">{parts.length} parts</span>
      </div>

      {/* Parts List */}
      <div className="part-list">
        {parts.map((part) => (
          <div
            key={part.id}
            className={`part-item ${selectedPartId === part.id ? 'selected' : ''} ${
              junctionParts.includes(part.id) ? 'junction' : ''
            }`}
            onClick={() => onPartSelect(selectedPartId === part.id ? null : part.id)}
          >
            <div
              className="part-color-swatch"
              style={{
                backgroundColor: part.color
                  ? `rgb(${Math.round(part.color[0] * 255)}, ${Math.round(
                      part.color[1] * 255
                    )}, ${Math.round(part.color[2] * 255)})`
                  : '#888',
              }}
            />
            <span className="part-name" title={part.name}>
              {part.name}
            </span>
            <span className="part-face-count">{part.faces.length} faces</span>
            {junctionParts.includes(part.id) && (
              <span className="part-junction-badge">Junction</span>
            )}
          </div>
        ))}
      </div>

      {/* Interfaces List */}
      {interfaces.length > 0 && (
        <div className="interface-list">
          <div className="interface-list-header">
            Detected Interfaces ({interfaces.length})
          </div>
          {interfaces.map((iface) => (
            <div
              key={iface.id}
              className={`interface-item ${
                selectedInterfaceId === iface.id ? 'selected' : ''
              }`}
              onClick={() =>
                onInterfaceSelect(selectedInterfaceId === iface.id ? null : iface.id)
              }
            >
              <span
                className={`interface-icon ${iface.interfaceType.replace('_', '-')}`}
              >
                {getInterfaceIcon(iface.interfaceType)}
              </span>
              <span className="interface-parts">
                {getPartName(iface.partA.partId)} ↔ {getPartName(iface.partB.partId)}
              </span>
              <span className="interface-type">
                {getInterfaceLabel(iface.interfaceType)}
              </span>
            </div>
          ))}
        </div>
      )}

      {parts.length === 0 && (
        <div className="assembly-empty">
          <p>No assembly loaded</p>
          <p className="assembly-empty-hint">
            Upload a STEP file to analyze tolerance stackups
          </p>
        </div>
      )}
    </div>
  );
}

export default AssemblyExplorer;
