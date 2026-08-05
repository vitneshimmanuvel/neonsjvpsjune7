import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { listBusinesses, createBusiness, createRegister, type RegisterSummary, listSavedTemplates, deleteSavedTemplate } from '../lib/api';
import { CATEGORIES, TEMPLATES, type Template, DEFAULT_BLANK_COLUMNS } from '../lib/templates';
import toast from 'react-hot-toast';
import {
  ArrowLeft, FileText, Hash, Calendar, ChevronDown, FlaskConical, Type,
  Building, GraduationCap, Store, Bus, Warehouse, Package, CalendarIcon, HeartPulse,
  Utensils, Dumbbell, Building2, User, ShieldCheck, Leaf, Plane,
  Phone, Mail, Globe, Star, CheckSquare, Image, Plus, Bookmark, Trash2
} from 'lucide-react';

import { CategoryCard } from '../components/templates/CategoryCard';
import { TemplateModal } from '../components/templates/TemplateModal';

const ICON_MAP: Record<string, any> = {
  'building': Building, 'graduation-cap': GraduationCap, 'store': Store, 'bus': Bus,
  'warehouse': Warehouse, 'package': Package, 'calendar': CalendarIcon, 'heart-pulse': HeartPulse,
  'utensils': Utensils, 'dumbbell': Dumbbell, 'building-2': Building2, 'user': User,
  'shield-check': ShieldCheck, 'leaf': Leaf, 'plane': Plane, 'plus': Plus,
};

function getColTypeIcon(type: string) {
  switch (type) {
    case 'number':   return <Hash size={10} />;
    case 'date':     return <Calendar size={10} />;
    case 'dropdown': return <ChevronDown size={10} />;
    case 'formula':  return <FlaskConical size={10} />;
    case 'phone':    return <Phone size={10} />;
    case 'email':    return <Mail size={10} />;
    case 'url':      return <Globe size={10} />;
    case 'rating':   return <Star size={10} />;
    case 'checkbox': return <CheckSquare size={10} />;
    case 'image':    return <Image size={10} />;
    default:         return <Type size={10} />;
  }
}

interface SavedTemplate {
  id: string;
  name: string;
  columns: Array<{ name: string; type: string; dropdownOptions?: string[]; formula?: string }>;
  createdAt: string;
}

export default function TemplatesPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryId || null);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);

  const { data: businesses } = useQuery({ queryKey: ['businesses'], queryFn: listBusinesses });
  const businessId = businesses?.[0]?.id;

  const { data: savedTemplates = [] } = useQuery({
    queryKey: ['savedTemplates', businessId],
    queryFn: () => listSavedTemplates(businessId!),
    enabled: !!businessId,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteSavedTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedTemplates', businessId] });
      toast.success('Template deleted!');
    },
    onError: (err: any) => {
      toast.error(`Failed to delete template: ${err.message}`);
    }
  });

  useEffect(() => {
    if (businesses && businesses.length === 0) {
      createBusiness('My Business').then(() => queryClient.invalidateQueries({ queryKey: ['businesses'] }));
    }
  }, [businesses, queryClient]);

  const createMutation = useMutation({
    mutationFn: (tpl: { name: string; columns: any[]; icon: string; iconColor?: string; category?: string }) => {
      // Capture businessId at call time so onSuccess closure is never stale
      return createRegister({
        businessId: businessId!,
        name: tpl.name,
        icon: tpl.icon,
        iconColor: tpl.iconColor || '#10B981',
        category: tpl.category || 'general',
        template: tpl.name,
        columns: tpl.columns.map((c) => ({
          name: c.name,
          type: c.type,
          dropdownOptions: c.dropdownOptions,
          formula: c.formula
        })),
      });
    },
    onSuccess: (newReg) => {
      // Use newReg.businessId (always defined) instead of the outer businessId closure
      // which can be undefined if the businesses query hasn't resolved yet
      const bId = newReg.businessId;
      // Directly patch the register list cache — bypasses staleTime entirely
      queryClient.setQueryData(['registers', bId], (old: RegisterSummary[] | undefined) => {
        const safeOld = old || [];
        if (safeOld.find((r) => r.id === newReg.id)) return safeOld;
        return [...safeOld, {
          id: newReg.id, businessId: newReg.businessId, name: newReg.name,
          icon: newReg.icon, iconColor: newReg.iconColor,
          category: newReg.category, template: newReg.template,
          createdAt: newReg.createdAt, updatedAt: newReg.updatedAt,
          entryCount: newReg.entryCount ?? 0, lastActivity: '',
        }];
      });
      // Background refetch to sync server state (won't block navigation)
      queryClient.invalidateQueries({ queryKey: ['registers', bId] });
      navigate(`/register/${newReg.id}`);
    },
    onError: (err: any) => {
      alert(err.message || 'Error creating register');
      setCreatingTemplate(null);
    },
  });

  const categoryData = selectedCategory ? CATEGORIES.find((c) => c.id === selectedCategory) : null;
  const subTemplates = selectedCategory ? TEMPLATES[selectedCategory] || [] : [];

  return (
    <div className="templates-page-root content-area templates-page-scroll" style={{ padding: '24px 32px' }}>
      <style>{`
        .tpl-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e2e8f0;
        }
        .tpl-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tpl-back-btn:hover {
          background: #f8fafc;
          border-color: #2563eb;
          color: #2563eb;
          transform: translateX(-3px);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);
        }
        .tpl-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .tpl-main-title {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.3px;
        }
        .tpl-badge-tag {
          padding: 3px 10px;
          border-radius: 20px;
          background: #eff6ff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid #bfdbfe;
        }
        .tpl-section-sub {
          margin: 4px 0 24px 0;
          font-size: 13.5px;
          color: #64748b;
          font-weight: 500;
        }
        .tpl-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
        }
        .tpl-card-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          position: relative;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 14px rgba(0,0,0,0.03);
        }
        .tpl-card-item:hover {
          transform: translateY(-4px);
          border-color: #93c5fd;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.14);
        }
        .tpl-icon-circle {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .tpl-card-item:hover .tpl-icon-circle {
          transform: scale(1.1) rotate(4deg);
        }
        .tpl-card-title {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .tpl-card-sub {
          font-size: 12.5px;
          color: #64748b;
          font-weight: 500;
        }
        .tpl-del-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          background: #fff1f2;
          border: 1px solid #ffe4e6;
          color: #e11d48;
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          zIndex: 2;
          transition: all 0.2s ease;
          opacity: 0.7;
        }
        .tpl-card-item:hover .tpl-del-btn {
          opacity: 1;
        }
        .tpl-del-btn:hover {
          background: #ffe4e6;
          transform: scale(1.15);
        }
      `}</style>

      {/* Modern Top Header Bar */}
      <div className="tpl-header-bar">
        <div className="tpl-title-wrap">
          <button className="tpl-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="tpl-main-title">Choose a Template</h1>
          <span className="tpl-badge-tag">{savedTemplates.length + 1} Available</span>
        </div>
      </div>

      {/* Subheading */}
      <div>
        <p className="tpl-section-sub">
          Choose a blank register to build custom columns or select one of your saved templates.
        </p>

        {/* Template Cards Grid */}
        <div className="tpl-card-grid">
          {/* Blank Register Card */}
          <div 
            className="tpl-card-item"
            onClick={() => {
              if (!businessId || creatingTemplate) return;
              setCreatingTemplate('Blank Register');
              createMutation.mutate({
                name: 'Blank Register',
                columns: DEFAULT_BLANK_COLUMNS,
                icon: 'file',
                iconColor: '#10B981',
                category: 'general'
              });
            }}
          >
            <div className="tpl-icon-circle" style={{ background: 'linear-gradient(135deg, #0b2545 0%, #0066cc 100%)', color: '#ffffff' }}>
              <Plus size={26} strokeWidth={2.5} />
            </div>
            <div className="tpl-card-title">Blank Register</div>
            <div className="tpl-card-sub">Start with default blank sheet</div>
          </div>

          {/* User-saved Custom Templates */}
          {savedTemplates.map((tpl) => (
            <div 
              key={tpl.id} 
              className="tpl-card-item" 
              onClick={() => {
                if (!businessId || creatingTemplate) return;
                setCreatingTemplate(tpl.name);
                createMutation.mutate({
                  name: tpl.name,
                  columns: tpl.columns,
                  icon: 'file',
                  iconColor: '#6366F1',
                  category: 'custom_template'
                });
              }}
            >
              {/* Delete button */}
              <button 
                className="tpl-del-btn" 
                title="Delete custom template"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to delete the template "${tpl.name}"?`)) {
                    deleteTemplateMutation.mutate(tpl.id);
                  }
                }}
              >
                <Trash2 size={15} />
              </button>

              <div className="tpl-icon-circle" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#ffffff' }}>
                <Bookmark size={24} />
              </div>
              <div className="tpl-card-title">{tpl.name}</div>
              <div className="tpl-card-sub">{tpl.columns.length} columns defined</div>
            </div>
          ))}
        </div>
      </div>

      {/* Template selection modal (kept for compatibility, though not normally reachable now) */}
      <TemplateModal 
        selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
        categoryData={categoryData} subTemplates={subTemplates}
        creatingTemplate={creatingTemplate}
        handleCreate={(tpl) => { 
          if (!businessId) return; // Prevent creation if businessId isn't loaded yet
          setCreatingTemplate(tpl.name); 
          createMutation.mutate(tpl); 
        }}
        getColTypeIcon={getColTypeIcon} ICON_MAP={ICON_MAP}
      />
    </div>
  );
}
