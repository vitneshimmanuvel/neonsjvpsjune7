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
    <div className="templates-page-root content-area templates-page-scroll">
      {/* Header */}
      <div className="register-header">
        <button className="register-header-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="register-header-title">Choose a Template</h1>
      </div>

      {/* Category Grid */}
      <div className="templates-page-body">
        <h2 className="templates-heading">Select a Template</h2>
        <p className="templates-subheading">
          Choose a blank register or use one of your custom templates.
        </p>
        <div className="categories-grid categories-grid--no-pad">
          {/* Blank Register */}
          <CategoryCard 
            key="blank"
            cat={{ id: 'blank', icon: 'plus', name: 'Blank Register' }} 
            icon={Plus} 
            count={0} 
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
          />

          {/* User-saved Custom Templates */}
          {savedTemplates.map((tpl) => (
            <div 
              key={tpl.id} 
              className="category-card" 
              style={{ position: 'relative', cursor: 'pointer' }}
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
              {/* Trash button to delete template */}
              <button 
                className="delete-template-btn" 
                title="Delete template"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to delete the template "${tpl.name}"?`)) {
                    deleteTemplateMutation.mutate(tpl.id);
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
              >
                <Trash2 size={16} />
              </button>

              <div className="category-icon" style={{ backgroundColor: '#6366F1' }}>
                <Bookmark size={24} color="#FFF" />
              </div>
              <div className="category-name">{tpl.name}</div>
              <div className="category-count">{tpl.columns.length} columns</div>
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
