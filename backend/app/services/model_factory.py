def create_estimator(model_id, task, parameters, seed):
    from sklearn.linear_model import LogisticRegression, Ridge
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, ExtraTreesClassifier, ExtraTreesRegressor, GradientBoostingClassifier, GradientBoostingRegressor
    from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.naive_bayes import GaussianNB
    from sklearn.neural_network import MLPClassifier, MLPRegressor

    classification = task == "classification"
    constructors = {
        "linear": LogisticRegression if classification else Ridge,
        "tree": DecisionTreeClassifier if classification else DecisionTreeRegressor,
        "forest": RandomForestClassifier if classification else RandomForestRegressor,
        "extra_trees": ExtraTreesClassifier if classification else ExtraTreesRegressor,
        "gradient_boosting": GradientBoostingClassifier if classification else GradientBoostingRegressor,
        "knn": KNeighborsClassifier if classification else KNeighborsRegressor,
        "svm": SVC if classification else SVR,
        "naive_bayes": GaussianNB,
        "mlp": MLPClassifier if classification else MLPRegressor,
    }
    if model_id in {"xgboost", "lightgbm", "catboost"}:
        try:
            if model_id == "xgboost":
                from xgboost import XGBClassifier, XGBRegressor
                constructors[model_id] = XGBClassifier if classification else XGBRegressor
            elif model_id == "lightgbm":
                from lightgbm import LGBMClassifier, LGBMRegressor
                constructors[model_id] = LGBMClassifier if classification else LGBMRegressor
            else:
                from catboost import CatBoostClassifier, CatBoostRegressor
                constructors[model_id] = CatBoostClassifier if classification else CatBoostRegressor
        except ImportError as error:
            raise ValueError(f"Chưa cài thư viện {model_id}. Cài requirements-optional.txt để chạy model này.") from error
    estimator = constructors[model_id]()
    allowed = set(estimator.get_params()) - {"n_jobs", "nthread", "thread_count", "device", "task_type", "random_state", "random_seed"}
    if model_id == "catboost":
        allowed.update({"iterations", "learning_rate", "depth", "l2_leaf_reg"})
    if set(parameters) - allowed:
        raise ValueError(f"Tham số không hỗ trợ: {', '.join(sorted(set(parameters) - allowed))}")
    parameters = dict(parameters)
    if "hidden_layer_sizes" in parameters:
        parameters["hidden_layer_sizes"] = tuple(parameters["hidden_layer_sizes"])
    estimator.set_params(**parameters)
    available = estimator.get_params()
    overrides = {key: seed for key in ("random_state", "random_seed") if key in available}
    overrides.update({key: 1 for key in ("n_jobs", "thread_count") if key in available})
    if model_id == "catboost":
        overrides.update(verbose=False, allow_writing_files=False, task_type="CPU", thread_count=1, random_seed=seed)
    if model_id == "lightgbm":
        overrides.update(verbosity=-1)
    if model_id == "xgboost":
        overrides.update(device="cpu", tree_method="hist")
    estimator.set_params(**overrides)
    return estimator